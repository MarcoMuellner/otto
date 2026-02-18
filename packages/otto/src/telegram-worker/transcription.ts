import { readFile } from "node:fs/promises"
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import path from "node:path"
import { createInterface } from "node:readline"
import { existsSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { homedir } from "node:os"

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
  close: () => Promise<void>
}

type WorkerProtocolReady = {
  event: "ready"
}

type WorkerProtocolResult = {
  event: "result"
  id: string
  ok: boolean
  text?: string
  language?: string | null
  error?: string
}

type WorkerProtocolMessage = WorkerProtocolReady | WorkerProtocolResult

type PendingWorkerRequest = {
  resolve: (result: TranscriptionResult) => void
  reject: (error: Error) => void
  timeout: NodeJS.Timeout
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
    close: async () => {
      // No resources to close for one-shot command execution.
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
    close: async () => {
      // No persistent resources for HTTP mode.
    },
  }
}

const resolveDefaultWorkerScriptPath = (): string => {
  const modulePath = decodeURIComponent(new URL(import.meta.url).pathname)
  const moduleDirectory = path.dirname(modulePath)
  const ottoRoot = process.env.OTTO_ROOT ?? path.resolve(moduleDirectory, "..")
  const candidatePaths = [
    path.resolve(moduleDirectory, "../scripts/parakeet-worker.py"),
    path.resolve(ottoRoot, "current", "scripts", "parakeet-worker.py"),
    path.resolve(process.cwd(), "scripts/parakeet-worker.py"),
  ]

  for (const candidate of candidatePaths) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  return candidatePaths[0]
}

const resolveDefaultWorkerPythonPath = (): string => {
  const ottoRoot = process.env.OTTO_ROOT ?? path.join(homedir(), ".local", "share", "otto")
  return path.join(ottoRoot, "models", "parakeet-v3", ".venv", "bin", "python")
}

const parseWorkerProtocol = (line: string): WorkerProtocolMessage | null => {
  let parsed: unknown

  try {
    parsed = JSON.parse(line)
  } catch {
    return null
  }

  if (typeof parsed !== "object" || parsed == null) {
    return null
  }

  const payload = parsed as { event?: unknown }
  if (payload.event === "ready") {
    return { event: "ready" }
  }

  if (payload.event === "result") {
    const resultPayload = parsed as {
      id?: unknown
      ok?: unknown
      text?: unknown
      language?: unknown
      error?: unknown
    }

    if (typeof resultPayload.id !== "string" || typeof resultPayload.ok !== "boolean") {
      return null
    }

    return {
      event: "result",
      id: resultPayload.id,
      ok: resultPayload.ok,
      text: typeof resultPayload.text === "string" ? resultPayload.text : undefined,
      language:
        typeof resultPayload.language === "string" || resultPayload.language == null
          ? (resultPayload.language ?? null)
          : null,
      error: typeof resultPayload.error === "string" ? resultPayload.error : undefined,
    }
  }

  return null
}

class WorkerTranscriptionGateway implements TranscriptionGateway {
  private readonly workerScriptPath: string
  private readonly workerPythonPath: string
  private readonly startupTimeoutMs: number
  private child: ChildProcessWithoutNullStreams | null = null
  private startupPromise: Promise<void> | null = null
  private pending = new Map<string, PendingWorkerRequest>()

  constructor(workerPythonPath: string, workerScriptPath: string, startupTimeoutMs: number) {
    this.workerPythonPath = workerPythonPath
    this.workerScriptPath = workerScriptPath
    this.startupTimeoutMs = startupTimeoutMs
  }

  private startWorker = async (): Promise<void> => {
    const child = spawn(this.workerPythonPath, [this.workerScriptPath], {
      stdio: ["pipe", "pipe", "pipe"],
    })

    this.child = child

    const stderrBuffer: string[] = []
    child.stderr.on("data", (chunk: Buffer) => {
      stderrBuffer.push(chunk.toString("utf8"))
      if (stderrBuffer.length > 20) {
        stderrBuffer.shift()
      }
    })

    child.on("close", () => {
      for (const [id, pendingRequest] of this.pending.entries()) {
        clearTimeout(pendingRequest.timeout)
        pendingRequest.reject(new Error("Transcription worker exited unexpectedly"))
        this.pending.delete(id)
      }
      this.child = null
      this.startupPromise = null
    })

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        child.kill("SIGKILL")
        const stderr = stderrBuffer.join("\n").trim()
        reject(
          new Error(
            stderr.length > 0
              ? `Transcription worker startup timed out after ${this.startupTimeoutMs}ms: ${stderr}`
              : `Transcription worker startup timed out after ${this.startupTimeoutMs}ms`
          )
        )
      }, this.startupTimeoutMs)

      const lineReader = createInterface({ input: child.stdout })

      lineReader.on("line", (line) => {
        const message = parseWorkerProtocol(line)
        if (!message) {
          return
        }

        if (message.event === "ready") {
          clearTimeout(timeout)
          lineReader.close()
          resolve()
        }
      })

      child.on("error", (error) => {
        clearTimeout(timeout)
        lineReader.close()
        reject(error)
      })

      child.on("exit", (code) => {
        clearTimeout(timeout)
        lineReader.close()
        reject(new Error(`Transcription worker exited during startup with code ${code ?? 1}`))
      })
    })

    const runtimeReader = createInterface({ input: child.stdout })
    runtimeReader.on("line", (line) => {
      const message = parseWorkerProtocol(line)
      if (!message || message.event !== "result") {
        return
      }

      const pendingRequest = this.pending.get(message.id)
      if (!pendingRequest) {
        return
      }

      clearTimeout(pendingRequest.timeout)
      this.pending.delete(message.id)

      if (!message.ok) {
        pendingRequest.reject(new Error(message.error ?? "Transcription worker request failed"))
        return
      }

      if (!message.text || message.text.trim().length === 0) {
        pendingRequest.reject(new Error("Transcription worker returned empty text"))
        return
      }

      pendingRequest.resolve({
        text: message.text.trim(),
        language: message.language ?? null,
      })
    })
  }

  private ensureWorkerStarted = async (): Promise<void> => {
    if (this.startupPromise) {
      await this.startupPromise
      return
    }

    if (this.child) {
      return
    }

    if (!this.startupPromise) {
      this.startupPromise = this.startWorker().finally(() => {
        if (!this.child) {
          this.startupPromise = null
        }
      })
    }

    await this.startupPromise
  }

  warmup = async (): Promise<void> => {
    await this.ensureWorkerStarted()
  }

  transcribe = async (request: TranscriptionRequest): Promise<TranscriptionResult> => {
    await this.ensureWorkerStarted()

    const child = this.child
    if (!child) {
      throw new Error("Transcription worker is not available")
    }

    const id = randomUUID()

    return await new Promise<TranscriptionResult>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        child.kill("SIGKILL")
        reject(new Error(`Transcription worker timed out after ${request.timeoutMs}ms`))
      }, request.timeoutMs)

      this.pending.set(id, {
        resolve,
        reject,
        timeout,
      })

      const payload = {
        event: "transcribe",
        id,
        audioFilePath: request.audioFilePath,
        language: request.language,
        model: request.model,
      }

      child.stdin.write(`${JSON.stringify(payload)}\n`)
    })
  }

  close = async (): Promise<void> => {
    const child = this.child
    this.child = null
    this.startupPromise = null

    if (!child) {
      return
    }

    try {
      child.stdin.write(`${JSON.stringify({ event: "shutdown" })}\n`)
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          child.kill("SIGKILL")
          resolve()
        }, 3_000)

        child.once("close", () => {
          clearTimeout(timeout)
          resolve()
        })
      })
    } catch {
      child.kill("SIGKILL")
    }
  }
}

const createWorkerTranscriptionGateway = async (
  startupTimeoutMs: number,
  workerScriptPath: string | null,
  workerPythonPath: string | null
): Promise<TranscriptionGateway> => {
  const resolvedPath = workerScriptPath ?? resolveDefaultWorkerScriptPath()
  const resolvedPythonPath = workerPythonPath ?? resolveDefaultWorkerPythonPath()

  if (!existsSync(resolvedPythonPath)) {
    throw new Error(
      `Transcription worker Python runtime not found at ${resolvedPythonPath}. Run ottoctl configure-voice-transcription to provision Parakeet.`
    )
  }

  const gateway = new WorkerTranscriptionGateway(resolvedPythonPath, resolvedPath, startupTimeoutMs)
  await gateway.warmup()
  return gateway
}

/**
 * Creates a transcription gateway behind a stable interface so worker orchestration can
 * run local in-process workers now while preserving HTTP/provider extension points.
 *
 * @param config Resolved transcription configuration.
 * @returns Concrete transcription gateway implementation.
 */
export const createTranscriptionGateway = async (
  config: TelegramTranscriptionConfig
): Promise<TranscriptionGateway> => {
  if (config.provider === "http") {
    return createHttpTranscriptionGateway(config.baseUrl, config.httpPath)
  }

  if (config.provider === "worker") {
    return await createWorkerTranscriptionGateway(
      config.workerStartupTimeoutMs,
      config.workerScriptPath,
      config.workerPythonPath
    )
  }

  if (!config.command) {
    throw new Error("Transcription command is not configured")
  }

  return createCommandTranscriptionGateway(config.command, config.commandArgs)
}
