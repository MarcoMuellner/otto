import { readFile } from "node:fs/promises"
import { spawn } from "node:child_process"
import path from "node:path"

import type { TelegramTranscriptionConfig } from "./config.js"

export type TranscriptionRequest = {
  audioFilePath: string
  mimeType: string
  language: string
  model: string
  timeoutMs: number
}

export type TranscriptionResult = {
  text: string
  language: string | null
}

export type TranscriptionGateway = {
  transcribe: (request: TranscriptionRequest) => Promise<TranscriptionResult>
}

const resolveTemplate = (value: string, request: TranscriptionRequest): string => {
  return value
    .replaceAll("{input}", request.audioFilePath)
    .replaceAll("{language}", request.language)
    .replaceAll("{model}", request.model)
    .replaceAll("{mime}", request.mimeType)
    .replaceAll("{filename}", path.basename(request.audioFilePath))
}

const parseTranscript = (rawOutput: string): TranscriptionResult => {
  const trimmed = rawOutput.trim()
  if (trimmed.length === 0) {
    throw new Error("Transcription command returned empty output")
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (typeof parsed === "object" && parsed != null) {
      const payload = parsed as {
        text?: unknown
        transcript?: unknown
        language?: unknown
      }

      const transcriptValue =
        typeof payload.text === "string"
          ? payload.text
          : typeof payload.transcript === "string"
            ? payload.transcript
            : null

      if (transcriptValue) {
        const language = typeof payload.language === "string" ? payload.language : null
        return {
          text: transcriptValue.trim(),
          language,
        }
      }
    }
  } catch {
    // Fall through to plain-text output handling.
  }

  return {
    text: trimmed,
    language: null,
  }
}

const createCommandTranscriptionGateway = (
  command: string,
  commandArgs: string[]
): TranscriptionGateway => {
  return {
    transcribe: async (request) => {
      const args = commandArgs.map((value) => resolveTemplate(value, request))

      const child = spawn(command, args, {
        stdio: ["ignore", "pipe", "pipe"],
      })

      const stdoutChunks: Buffer[] = []
      const stderrChunks: Buffer[] = []

      child.stdout.on("data", (chunk: Buffer) => {
        stdoutChunks.push(chunk)
      })

      child.stderr.on("data", (chunk: Buffer) => {
        stderrChunks.push(chunk)
      })

      const exitCode = await new Promise<number>((resolve, reject) => {
        const timeout = setTimeout(() => {
          child.kill("SIGKILL")
          reject(new Error(`Transcription command timed out after ${request.timeoutMs}ms`))
        }, request.timeoutMs)

        child.on("error", (error) => {
          clearTimeout(timeout)
          reject(error)
        })

        child.on("close", (code) => {
          clearTimeout(timeout)
          resolve(code ?? 1)
        })
      })

      if (exitCode !== 0) {
        const stderrText = Buffer.concat(stderrChunks).toString("utf8").trim()
        throw new Error(
          stderrText.length > 0
            ? `Transcription command failed with code ${exitCode}: ${stderrText}`
            : `Transcription command failed with code ${exitCode}`
        )
      }

      const stdoutText = Buffer.concat(stdoutChunks).toString("utf8")
      return parseTranscript(stdoutText)
    },
  }
}

const createHttpTranscriptionGateway = (
  baseUrl: string,
  httpPath: string
): TranscriptionGateway => {
  return {
    transcribe: async (request) => {
      const formData = new FormData()
      const audio = await readFile(request.audioFilePath)
      const blob = new Blob([audio], { type: request.mimeType })

      formData.append("file", blob, path.basename(request.audioFilePath))
      formData.append("language", request.language)
      formData.append("model", request.model)

      const response = await fetch(`${baseUrl}${httpPath}`, {
        method: "POST",
        body: formData,
        signal: AbortSignal.timeout(request.timeoutMs),
      })

      if (!response.ok) {
        throw new Error(`Transcription HTTP request failed (${response.status})`)
      }

      const payload = (await response.json()) as {
        text?: unknown
        transcript?: unknown
        transcription?: unknown
        language?: unknown
      }

      const text =
        typeof payload.transcription === "string"
          ? payload.transcription
          : typeof payload.text === "string"
            ? payload.text
            : typeof payload.transcript === "string"
              ? payload.transcript
              : ""

      const trimmed = text.trim()
      if (trimmed.length === 0) {
        throw new Error("Transcription HTTP response did not include text")
      }

      return {
        text: trimmed,
        language: typeof payload.language === "string" ? payload.language : null,
      }
    },
  }
}

/**
 * Creates a transcription gateway behind a stable interface so worker orchestration can
 * start with local command execution and switch to HTTP without changing call sites.
 *
 * @param config Resolved transcription configuration from environment.
 * @returns Concrete transcription gateway implementation.
 */
export const createTranscriptionGateway = (
  config: TelegramTranscriptionConfig
): TranscriptionGateway => {
  if (config.provider === "http") {
    return createHttpTranscriptionGateway(config.baseUrl, config.httpPath)
  }

  if (!config.command) {
    throw new Error("Transcription command is not configured")
  }

  return createCommandTranscriptionGateway(config.command, config.commandArgs)
}
