import { afterEach, describe, expect, it, vi } from "vitest"
import type { Logger } from "pino"

import { startTelegramWorker } from "../../src/telegram-worker/worker.js"

const createLoggerStub = () => {
  const info = vi.fn()
  const warn = vi.fn()
  const debug = vi.fn()

  return {
    info,
    warn,
    debug,
    logger: {
      info,
      warn,
      debug,
    } as unknown as Logger,
  }
}

describe("startTelegramWorker", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("emits heartbeat logs while enabled", () => {
    // Arrange
    vi.useFakeTimers()
    const { logger, info, warn, debug } = createLoggerStub()

    // Act
    const worker = startTelegramWorker(logger, {
      enabled: true,
      botToken: "token",
      allowedUserId: 1001,
      allowedChatId: 2002,
      heartbeatMs: 2_000,
    })
    vi.advanceTimersByTime(2_000)

    // Assert
    expect(info).toHaveBeenCalledWith(
      {
        heartbeatMs: 2_000,
        hasBotToken: true,
        allowedUserId: 1001,
        allowedChatId: 2002,
      },
      "Telegram worker started"
    )
    expect(warn).not.toHaveBeenCalled()
    expect(debug).toHaveBeenCalledWith({ heartbeatMs: 2_000 }, "Telegram worker heartbeat")

    worker.stop()
  })

  it("logs disabled state and does not create heartbeat", () => {
    // Arrange
    vi.useFakeTimers()
    const { logger, info, debug } = createLoggerStub()

    // Act
    const worker = startTelegramWorker(logger, {
      enabled: false,
      botToken: "",
      allowedUserId: 0,
      allowedChatId: 0,
      heartbeatMs: 2_000,
    })
    vi.advanceTimersByTime(4_000)

    // Assert
    expect(info).toHaveBeenCalledWith("Telegram worker disabled by configuration")
    expect(debug).not.toHaveBeenCalled()

    worker.stop()
  })

  it("rejects unauthorized updates before processing", () => {
    // Arrange
    const { logger, warn } = createLoggerStub()
    const worker = startTelegramWorker(logger, {
      enabled: true,
      botToken: "token",
      allowedUserId: 1001,
      allowedChatId: 2002,
      heartbeatMs: 2_000,
    })
    const unauthorizedUpdate = {
      message: {
        from: { id: 3333 },
        chat: { id: 2002, type: "private" },
      },
    }

    // Act
    const decision = worker.canProcessUpdate(unauthorizedUpdate)

    // Assert
    expect(decision).toBe(false)
    expect(warn).toHaveBeenCalledWith(
      {
        reason: "user_not_allowed",
        userId: 3333,
        chatId: 2002,
        chatType: "private",
      },
      "Telegram update denied by security gate"
    )

    worker.stop()
  })
})
