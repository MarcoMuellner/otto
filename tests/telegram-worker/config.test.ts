import { describe, expect, it } from "vitest"

import { resolveTelegramWorkerConfig } from "../../src/telegram-worker/config.js"

describe("resolveTelegramWorkerConfig", () => {
  it("uses safe defaults when optional values are missing", () => {
    // Arrange
    const environment = {}

    // Act
    const config = resolveTelegramWorkerConfig(environment)

    // Assert
    expect(config).toEqual({
      enabled: true,
      botToken: null,
      heartbeatMs: 60_000,
    })
  })

  it("supports disabling the worker from environment", () => {
    // Arrange
    const environment = {
      OTTO_TELEGRAM_WORKER_ENABLED: "0",
    }

    // Act
    const config = resolveTelegramWorkerConfig(environment)

    // Assert
    expect(config.enabled).toBe(false)
  })

  it("throws when heartbeat interval is invalid", () => {
    // Arrange
    const environment = {
      OTTO_TELEGRAM_WORKER_HEARTBEAT_MS: "200",
    }

    // Act and Assert
    expect(() => resolveTelegramWorkerConfig(environment)).toThrow(
      "OTTO_TELEGRAM_WORKER_HEARTBEAT_MS"
    )
  })
})
