import { describe, expect, it } from "vitest"

import { resolveTelegramWorkerConfig } from "../../src/telegram-worker/config.js"

describe("resolveTelegramWorkerConfig", () => {
  it("uses safe defaults when optional values are missing", () => {
    // Arrange
    const environment = {
      OTTO_TELEGRAM_WORKER_ENABLED: "0",
    }

    // Act
    const config = resolveTelegramWorkerConfig(environment)

    // Assert
    expect(config).toEqual({
      enabled: false,
      botToken: "",
      allowedUserId: 0,
      heartbeatMs: 60_000,
      outboundPollMs: 2_000,
      outboundMaxAttempts: 5,
      outboundRetryBaseMs: 5_000,
      outboundRetryMaxMs: 300_000,
      opencodeBaseUrl: "http://127.0.0.1:4096",
      promptTimeoutMs: 120_000,
    })
  })

  it("resolves enabled worker policy fields", () => {
    // Arrange
    const environment = {
      TELEGRAM_BOT_TOKEN: "bot-token",
      TELEGRAM_ALLOWED_USER_ID: "123",
    }

    // Act
    const config = resolveTelegramWorkerConfig(environment)

    // Assert
    expect(config).toEqual({
      enabled: true,
      botToken: "bot-token",
      allowedUserId: 123,
      heartbeatMs: 60_000,
      outboundPollMs: 2_000,
      outboundMaxAttempts: 5,
      outboundRetryBaseMs: 5_000,
      outboundRetryMaxMs: 300_000,
      opencodeBaseUrl: "http://127.0.0.1:4096",
      promptTimeoutMs: 120_000,
    })
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

  it("throws when required allowlist values are missing while enabled", () => {
    // Arrange
    const environment = {
      TELEGRAM_BOT_TOKEN: "bot-token",
    }

    // Act and Assert
    expect(() => resolveTelegramWorkerConfig(environment)).toThrow("TELEGRAM_ALLOWED_USER_ID")
  })

  it("throws when prompt timeout is too small", () => {
    // Arrange
    const environment = {
      TELEGRAM_BOT_TOKEN: "bot-token",
      TELEGRAM_ALLOWED_USER_ID: "123",
      OTTO_TELEGRAM_PROMPT_TIMEOUT_MS: "1000",
    }

    // Act and Assert
    expect(() => resolveTelegramWorkerConfig(environment)).toThrow(
      "OTTO_TELEGRAM_PROMPT_TIMEOUT_MS"
    )
  })

  it("throws when outbound retry max is below retry base", () => {
    // Arrange
    const environment = {
      TELEGRAM_BOT_TOKEN: "bot-token",
      TELEGRAM_ALLOWED_USER_ID: "123",
      OTTO_TELEGRAM_OUTBOUND_RETRY_BASE_MS: "5000",
      OTTO_TELEGRAM_OUTBOUND_RETRY_MAX_MS: "1000",
    }

    // Act and Assert
    expect(() => resolveTelegramWorkerConfig(environment)).toThrow(
      "OTTO_TELEGRAM_OUTBOUND_RETRY_MAX_MS"
    )
  })
})
