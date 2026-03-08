import { createWriteStream, mkdirSync, readdirSync, unlinkSync, type WriteStream } from "node:fs"
import path from "node:path"
import { Writable } from "node:stream"

const ONE_DAY_MS = 24 * 60 * 60 * 1000

type DailyLogStreamInput = {
  directory: string
  filePrefix?: string
  retentionDays?: number
  now?: () => Date
}

const formatLocalDate = (value: Date): string => {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, "0")
  const day = String(value.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

const parseLocalDate = (value: string): Date => {
  const [year, month, day] = value.split("-").map((part) => Number.parseInt(part, 10))
  return new Date(year, month - 1, day, 0, 0, 0, 0)
}

const escapeForRegex = (value: string): string => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

const isFileOlderThanRetention = (input: {
  fileDate: string
  now: Date
  retentionDays: number
}): boolean => {
  const nowStart = new Date(
    input.now.getFullYear(),
    input.now.getMonth(),
    input.now.getDate(),
    0,
    0,
    0,
    0
  )
  const fileStart = parseLocalDate(input.fileDate)
  const ageMs = nowStart.getTime() - fileStart.getTime()
  return ageMs >= input.retentionDays * ONE_DAY_MS
}

/**
 * Prunes expired daily log files from a directory based on filename date suffix.
 *
 * @param input Directory, filename prefix, retention policy, and current time source.
 */
export const pruneDailyLogs = (input: {
  directory: string
  filePrefix: string
  retentionDays: number
  now: Date
}): void => {
  const pattern = new RegExp(`^${escapeForRegex(input.filePrefix)}-(\\d{4}-\\d{2}-\\d{2})\\.log$`)

  const entries = readdirSync(input.directory, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue
    }

    const match = pattern.exec(entry.name)
    if (!match) {
      continue
    }

    const fileDate = match[1]
    if (
      !isFileOlderThanRetention({ fileDate, now: input.now, retentionDays: input.retentionDays })
    ) {
      continue
    }

    unlinkSync(path.join(input.directory, entry.name))
  }
}

/**
 * Creates a writable stream that writes to one daily logfile and rotates automatically when
 * local date changes, while pruning files older than the configured retention window.
 *
 * @param input Directory and retention settings for daily logfile management.
 * @returns Writable stream compatible with Pino destinations.
 */
export const createDailyRotatingLogStream = (input: DailyLogStreamInput): Writable => {
  const filePrefix = input.filePrefix ?? "otto"
  const retentionDays = Math.max(1, Math.trunc(input.retentionDays ?? 30))
  const now = input.now ?? (() => new Date())
  mkdirSync(input.directory, { recursive: true })

  class DailyRotatingLogStream extends Writable {
    private activeDate: string | null = null
    private activeStream: WriteStream | null = null

    private ensureActiveStream(): WriteStream {
      const currentDate = formatLocalDate(now())
      if (this.activeStream && this.activeDate === currentDate) {
        return this.activeStream
      }

      this.activeStream?.end()
      const filePath = path.join(input.directory, `${filePrefix}-${currentDate}.log`)
      this.activeStream = createWriteStream(filePath, { flags: "a" })
      this.activeDate = currentDate

      pruneDailyLogs({
        directory: input.directory,
        filePrefix,
        retentionDays,
        now: now(),
      })

      return this.activeStream
    }

    override _write(
      chunk: Buffer | string,
      encoding: BufferEncoding,
      callback: (error?: Error | null) => void
    ): void {
      let stream: WriteStream

      try {
        stream = this.ensureActiveStream()
      } catch (error) {
        callback(error instanceof Error ? error : new Error(String(error)))
        return
      }

      if (Buffer.isBuffer(chunk)) {
        stream.write(chunk, callback)
        return
      }

      stream.write(chunk, encoding, callback)
    }

    override _final(callback: (error?: Error | null) => void): void {
      if (!this.activeStream) {
        callback()
        return
      }

      this.activeStream.end(() => callback())
    }
  }

  return new DailyRotatingLogStream()
}
