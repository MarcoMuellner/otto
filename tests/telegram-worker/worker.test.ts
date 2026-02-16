import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"
import type { Logger } from "pino"

import { openPersistenceDatabase } from "../../src/persistence/index.js"
import { startTelegramWorker, type TelegramBotRuntime } from "../../src/telegram-worker/worker.js"

const TEMP_PREFIX = path.join(tmpdir(), "otto-worker-")
const cleanupPaths: string[] = []

afterEach(async () => {
  vi.useRealTimers()
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

const createFakeBotRuntime = () => {
  let handler:
    | ((update: {
        sourceMessageId: string
        chatId: number
        userId: number
        text: string
        update: unknown
      }) => Promise<void>)
    | null = null

  const sentMessages: Array<{ chatId: number; text: string }> = []

  const runtime: TelegramBotRuntime = {
    onTextMessage: (nextHandler) => {
      handler = nextHandler
    },
    sendMessage: async (chatId, text) => {
      sentMessages.push({ chatId, text })
    },
    launch: async () => {},
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
      if (!handler) {
        throw new Error("Handler not registered")
      }

      await handler(update)
    },
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
        enabled: true,
        botToken: "token",
        allowedUserId: 1001,
        allowedChatId: 2002,
        heartbeatMs: 2_000,
        outboundPollMs: 2_000,
        outboundMaxAttempts: 5,
        outboundRetryBaseMs: 5_000,
        outboundRetryMaxMs: 300_000,
        opencodeBaseUrl: "http://127.0.0.1:4096",
        promptTimeoutMs: 10_000,
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
      {
        heartbeatMs: 2_000,
        outboundPollMs: 2_000,
        outboundMaxAttempts: 5,
        outboundRetryBaseMs: 5_000,
        outboundRetryMaxMs: 300_000,
        hasBotToken: true,
        allowedUserId: 1001,
        allowedChatId: 2002,
        opencodeBaseUrl: "http://127.0.0.1:4096",
        outboundTool: "queue_telegram_message",
      },
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
        enabled: true,
        botToken: "token",
        allowedUserId: 1001,
        allowedChatId: 2002,
        heartbeatMs: 2_000,
        outboundPollMs: 2_000,
        outboundMaxAttempts: 5,
        outboundRetryBaseMs: 5_000,
        outboundRetryMaxMs: 300_000,
        opencodeBaseUrl: "http://127.0.0.1:4096",
        promptTimeoutMs: 10_000,
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
    const worker = await startTelegramWorker(logger, {
      enabled: false,
      botToken: "",
      allowedUserId: 0,
      allowedChatId: 0,
      heartbeatMs: 2_000,
      outboundPollMs: 2_000,
      outboundMaxAttempts: 5,
      outboundRetryBaseMs: 5_000,
      outboundRetryMaxMs: 300_000,
      opencodeBaseUrl: "http://127.0.0.1:4096",
      promptTimeoutMs: 10_000,
    })
    await worker.stop()

    // Assert
    expect(info).toHaveBeenCalledWith("Telegram worker disabled by configuration")
  })
})
