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
      botToken: null,
      heartbeatMs: 2_000,
    })
    vi.advanceTimersByTime(2_000)

    // Assert
    expect(info).toHaveBeenCalledWith(
      {
        heartbeatMs: 2_000,
        hasBotToken: false,
      },
      "Telegram worker started"
    )
    expect(warn).toHaveBeenCalledWith("Telegram worker running without TELEGRAM_BOT_TOKEN")
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
      botToken: null,
      heartbeatMs: 2_000,
    })
    vi.advanceTimersByTime(4_000)

    // Assert
    expect(info).toHaveBeenCalledWith("Telegram worker disabled by configuration")
    expect(debug).not.toHaveBeenCalled()

    worker.stop()
  })
})
