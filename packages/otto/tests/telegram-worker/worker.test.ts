import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"
import type { Logger } from "pino"

import { openPersistenceDatabase } from "../../src/persistence/index.js"
import { startTelegramWorker, type TelegramBotRuntime } from "../../src/telegram-worker/worker.js"
import type { TelegramWorkerConfig } from "../../src/telegram-worker/config.js"

const TEMP_PREFIX = path.join(tmpdir(), "otto-worker-")
const cleanupPaths: string[] = []

afterEach(async () => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  await Promise.all(
    cleanupPaths.splice(0).map(async (directory) => rm(directory, { recursive: true, force: true }))
  )
})

const createLoggerStub = () => {
  const info = vi.fn()
  const warn = vi.fn()
  const debug = vi.fn()
  const error = vi.fn()

  return {
    info,
    warn,
    debug,
    error,
    logger: {
      info,
      warn,
      debug,
      error,
    } as unknown as Logger,
  }
}

const createFakeBotRuntime = (options: { launchError?: Error } = {}) => {
  let textHandler:
    | ((update: {
        sourceMessageId: string
        chatId: number
        userId: number
        text: string
        update: unknown
      }) => Promise<void>)
    | null = null
  let voiceHandler:
    | ((update: {
        sourceMessageId: string
        chatId: number
        userId: number
        voice: {
          inputType: "voice" | "audio"
          fileId: string
          fileUniqueId: string | null
          durationSec: number
          mimeType: string
          fileSizeBytes: number | null
        }
        update: unknown
      }) => Promise<void>)
    | null = null
  let unsupportedMediaHandler:
    | ((update: {
        sourceMessageId: string
        chatId: number
        userId: number
        mediaType:
          | "video_note"
          | "video"
          | "document"
          | "photo"
          | "sticker"
          | "animation"
          | "unknown"
        update: unknown
      }) => Promise<void>)
    | null = null

  const sentMessages: Array<{ chatId: number; text: string }> = []

  const runtime: TelegramBotRuntime = {
    onTextMessage: (nextHandler) => {
      textHandler = nextHandler
    },
    onVoiceMessage: (nextHandler) => {
      voiceHandler = nextHandler
    },
    onUnsupportedMediaMessage: (nextHandler) => {
      unsupportedMediaHandler = nextHandler
    },
    sendMessage: async (chatId, text) => {
      sentMessages.push({ chatId, text })
    },
    resolveVoiceDownload: async () => ({
      url: "http://127.0.0.1/voice.ogg",
      fileSizeBytes: 123,
      fileName: "voice.ogg",
    }),
    launch: async () => {
      if (options.launchError) {
        throw options.launchError
      }
    },
    stop: async () => {},
  }

  return {
    runtime,
    sentMessages,
    dispatch: async (update: {
      sourceMessageId: string
      chatId: number
      userId: number
      text: string
      update: unknown
    }) => {
      if (!textHandler) {
        throw new Error("Handler not registered")
      }

      await textHandler(update)
    },
    dispatchVoice: async (update: {
      sourceMessageId: string
      chatId: number
      userId: number
      voice: {
        inputType: "voice" | "audio"
        fileId: string
        fileUniqueId: string | null
        durationSec: number
        mimeType: string
        fileSizeBytes: number | null
      }
      update: unknown
    }) => {
      if (!voiceHandler) {
        throw new Error("Voice handler not registered")
      }

      await voiceHandler(update)
    },
    dispatchUnsupportedMedia: async (update: {
      sourceMessageId: string
      chatId: number
      userId: number
      mediaType: "video_note" | "video" | "document" | "photo" | "sticker" | "animation" | "unknown"
      update: unknown
    }) => {
      if (!unsupportedMediaHandler) {
        throw new Error("Unsupported media handler not registered")
      }

      await unsupportedMediaHandler(update)
    },
  }
}

const createWorkerConfig = (
  overrides: Partial<TelegramWorkerConfig> = {}
): TelegramWorkerConfig => {
  return {
    enabled: true,
    botToken: "token",
    allowedUserId: 1001,
    heartbeatMs: 2_000,
    outboundPollMs: 2_000,
    outboundMaxAttempts: 5,
    outboundRetryBaseMs: 5_000,
    outboundRetryMaxMs: 300_000,
    opencodeBaseUrl: "http://127.0.0.1:4096",
    promptTimeoutMs: 10_000,
    voice: {
      enabled: false,
      maxDurationSec: 180,
      maxBytes: 10 * 1024 * 1024,
      downloadTimeoutMs: 20_000,
    },
    transcription: {
      provider: "command",
      timeoutMs: 300_000,
      workerStartupTimeoutMs: 600_000,
      language: "en-US",
      model: "parakeet-v3",
      command: "parakeet-cli",
      commandArgs: ["{input}"],
      workerScriptPath: null,
      workerPythonPath: null,
      baseUrl: "http://127.0.0.1:9000",
      httpPath: "/v1/audio/transcriptions",
    },
    ...overrides,
  }
}

describe("startTelegramWorker", () => {
  it("starts and stops with heartbeat logs", async () => {
    // Arrange
    vi.useFakeTimers()
    const { logger, info, debug } = createLoggerStub()
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const fakeBot = createFakeBotRuntime()

    // Act
    const worker = await startTelegramWorker(
      logger,
      {
        ...createWorkerConfig(),
      },
      {
        createBotRuntime: () => fakeBot.runtime,
        openDatabase: () => openPersistenceDatabase({ dbPath: path.join(tempRoot, "state.db") }),
        createSessionGateway: () => ({
          ensureSession: async () => "session-1",
          promptSession: async () => "ok",
        }),
      }
    )
    vi.advanceTimersByTime(2_000)
    await worker.stop()

    // Assert
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({
        heartbeatMs: 2_000,
        outboundPollMs: 2_000,
        outboundMaxAttempts: 5,
        outboundRetryBaseMs: 5_000,
        outboundRetryMaxMs: 300_000,
        hasBotToken: true,
        allowedUserId: 1001,
        opencodeBaseUrl: "http://127.0.0.1:4096",
      }),
      "Telegram worker started"
    )
    expect(debug).toHaveBeenCalledWith({ heartbeatMs: 2_000 }, "Telegram worker heartbeat")
  })

  it("blocks unauthorized updates before bridge processing", async () => {
    // Arrange
    const { logger, warn } = createLoggerStub()
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const fakeBot = createFakeBotRuntime()

    const worker = await startTelegramWorker(
      logger,
      {
        ...createWorkerConfig(),
      },
      {
        createBotRuntime: () => fakeBot.runtime,
        openDatabase: () => openPersistenceDatabase({ dbPath: path.join(tempRoot, "state.db") }),
        createSessionGateway: () => ({
          ensureSession: async () => "session-1",
          promptSession: async () => "ok",
        }),
      }
    )

    // Act
    await fakeBot.dispatch({
      sourceMessageId: "1",
      chatId: 2002,
      userId: 3333,
      text: "hi",
      update: {
        message: {
          from: { id: 3333 },
          chat: { id: 2002, type: "private" },
        },
      },
    })

    // Assert
    expect(warn).toHaveBeenCalledWith(
      {
        reason: "user_not_allowed",
        userId: 3333,
        chatId: 2002,
        chatType: "private",
      },
      "Telegram update denied by security gate"
    )
    expect(fakeBot.sentMessages).toHaveLength(0)

    await worker.stop()
  })

  it("returns no-op handle when worker is disabled", async () => {
    // Arrange
    const { logger, info } = createLoggerStub()

    // Act
    const worker = await startTelegramWorker(logger, createWorkerConfig({ enabled: false }))
    await worker.stop()

    // Assert
    expect(info).toHaveBeenCalledWith("Telegram worker disabled by configuration")
  })

  it("keeps running queue loop when Telegram launch fails", async () => {
    // Arrange
    const { logger, error, info } = createLoggerStub()
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const fakeBot = createFakeBotRuntime({ launchError: new Error("launch failed") })

    // Act
    const worker = await startTelegramWorker(
      logger,
      {
        ...createWorkerConfig(),
      },
      {
        createBotRuntime: () => fakeBot.runtime,
        openDatabase: () => openPersistenceDatabase({ dbPath: path.join(tempRoot, "state.db") }),
        createSessionGateway: () => ({
          ensureSession: async () => "session-1",
          promptSession: async () => "ok",
        }),
      }
    )
    await Promise.resolve()

    // Assert
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({ allowedUserId: 1001 }),
      "Telegram worker started"
    )
    expect(error).toHaveBeenCalledWith(
      { error: "launch failed" },
      "Telegram bot launch failed; inbound updates may be unavailable"
    )

    await worker.stop()
  })

  it("rejects oversized voice payload before transcription", async () => {
    // Arrange
    const { logger } = createLoggerStub()
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const fakeBot = createFakeBotRuntime()
    const transcribe = vi.fn(async () => ({ text: "ok", language: "en" }))

    const worker = await startTelegramWorker(
      logger,
      createWorkerConfig({
        voice: {
          enabled: true,
          maxDurationSec: 180,
          maxBytes: 128,
          downloadTimeoutMs: 20_000,
        },
      }),
      {
        createBotRuntime: () => fakeBot.runtime,
        openDatabase: () => openPersistenceDatabase({ dbPath: path.join(tempRoot, "state.db") }),
        createSessionGateway: () => ({
          ensureSession: async () => "session-1",
          promptSession: async () => "ok",
        }),
        createTranscriptionGateway: () => ({ transcribe, close: async () => {} }),
      }
    )

    // Act
    await fakeBot.dispatchVoice({
      sourceMessageId: "voice-oversize-1",
      chatId: 2002,
      userId: 1001,
      voice: {
        inputType: "voice",
        fileId: "file-1",
        fileUniqueId: "unique-1",
        durationSec: 8,
        mimeType: "audio/ogg",
        fileSizeBytes: 1024,
      },
      update: {
        message: {
          from: { id: 1001 },
          chat: { id: 2002, type: "private" },
        },
      },
    })

    // Assert
    expect(transcribe).not.toHaveBeenCalled()
    const lastMessage = fakeBot.sentMessages[fakeBot.sentMessages.length - 1]
    expect(lastMessage?.text).toContain("too large")

    await worker.stop()
  })

  it("transcribes voice input and forwards transcript into inbound bridge", async () => {
    // Arrange
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(Buffer.from("voice-audio"), {
          status: 200,
          headers: {
            "content-length": "11",
          },
        })
      })
    )

    const { logger } = createLoggerStub()
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const fakeBot = createFakeBotRuntime()
    const ensureSession = vi.fn(async () => "session-1")
    const promptSession = vi.fn(async () => "assistant reply")

    const worker = await startTelegramWorker(
      logger,
      createWorkerConfig({
        voice: {
          enabled: true,
          maxDurationSec: 180,
          maxBytes: 1024 * 1024,
          downloadTimeoutMs: 20_000,
        },
      }),
      {
        createBotRuntime: () => fakeBot.runtime,
        openDatabase: () => openPersistenceDatabase({ dbPath: path.join(tempRoot, "state.db") }),
        createSessionGateway: () => ({
          ensureSession,
          promptSession,
        }),
        createTranscriptionGateway: () => ({
          transcribe: async () => ({ text: "voice transcript", language: "en-US" }),
          close: async () => {},
        }),
      }
    )

    // Act
    await fakeBot.dispatchVoice({
      sourceMessageId: "voice-success-1",
      chatId: 2002,
      userId: 1001,
      voice: {
        inputType: "voice",
        fileId: "file-1",
        fileUniqueId: "unique-1",
        durationSec: 8,
        mimeType: "audio/ogg",
        fileSizeBytes: 1024,
      },
      update: {
        message: {
          from: { id: 1001 },
          chat: { id: 2002, type: "private" },
        },
      },
    })

    // Assert
    expect(ensureSession).toHaveBeenCalled()
    expect(promptSession).toHaveBeenCalledWith("session-1", "voice transcript")

    await worker.stop()
  })
})
