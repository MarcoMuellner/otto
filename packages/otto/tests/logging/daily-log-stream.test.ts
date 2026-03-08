import os from "node:os"
import path from "node:path"
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { Writable } from "node:stream"

import { afterEach, describe, expect, it } from "vitest"

import { createDailyRotatingLogStream, pruneDailyLogs } from "../../src/logging/daily-log-stream.js"

const tempDirectories: string[] = []

const createTempDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "otto-log-stream-"))
  tempDirectories.push(directory)
  return directory
}

const writeChunk = async (stream: Writable, payload: string): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    stream.write(payload, "utf8", (error) => {
      if (error) {
        reject(error)
        return
      }

      resolve()
    })
  })
}

const endStream = async (stream: Writable): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    stream.end((error) => {
      if (error) {
        reject(error)
        return
      }

      resolve()
    })
  })
}

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map(async (directory) => {
      await rm(directory, { recursive: true, force: true })
    })
  )
})

describe("pruneDailyLogs", () => {
  it("removes files older than retention window", async () => {
    const directory = await createTempDirectory()
    await writeFile(path.join(directory, "otto-2026-02-06.log"), "old\n", "utf8")
    await writeFile(path.join(directory, "otto-2026-02-07.log"), "keep\n", "utf8")
    await writeFile(path.join(directory, "otto-2026-03-08.log"), "today\n", "utf8")

    pruneDailyLogs({
      directory,
      filePrefix: "otto",
      retentionDays: 30,
      now: new Date(2026, 2, 8, 12, 0, 0, 0),
    })

    const files = await readdir(directory)
    expect(files).not.toContain("otto-2026-02-06.log")
    expect(files).toContain("otto-2026-02-07.log")
    expect(files).toContain("otto-2026-03-08.log")
  })
})

describe("createDailyRotatingLogStream", () => {
  it("rotates when local date changes", async () => {
    const directory = await createTempDirectory()
    let currentTime = new Date(2026, 2, 8, 23, 59, 0, 0)

    const stream = createDailyRotatingLogStream({
      directory,
      now: () => currentTime,
    })

    await writeChunk(stream, "first\n")
    currentTime = new Date(2026, 2, 9, 0, 1, 0, 0)
    await writeChunk(stream, "second\n")
    await endStream(stream)

    const firstDay = await readFile(path.join(directory, "otto-2026-03-08.log"), "utf8")
    const secondDay = await readFile(path.join(directory, "otto-2026-03-09.log"), "utf8")
    expect(firstDay).toContain("first")
    expect(secondDay).toContain("second")
  })

  it("prunes expired files during rollover checks", async () => {
    const directory = await createTempDirectory()
    await writeFile(path.join(directory, "otto-2026-01-01.log"), "expired\n", "utf8")

    const stream = createDailyRotatingLogStream({
      directory,
      retentionDays: 30,
      now: () => new Date(2026, 2, 8, 10, 0, 0, 0),
    })

    await writeChunk(stream, "active\n")
    await endStream(stream)

    const files = await readdir(directory)
    expect(files).not.toContain("otto-2026-01-01.log")
    expect(files).toContain("otto-2026-03-08.log")
  })
})
