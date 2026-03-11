import { describe, expect, it } from "vitest"

import { resolveSchedulerConfig } from "../../src/scheduler/config.js"

describe("resolveSchedulerConfig", () => {
  it("returns defaults when environment is empty", () => {
    // Arrange
    const environment = {}

    // Act
    const config = resolveSchedulerConfig(environment)

    // Assert
    expect(config).toEqual({
      enabled: true,
      tickMs: 60_000,
      batchSize: 20,
      lockLeaseMs: 90_000,
      background: {
        requestTimeoutMs: null,
        stallTimeoutMs: 1_800_000,
        transientRetryCount: 2,
        retryBaseMs: 1_000,
        retryMaxMs: 30_000,
      },
    })
  })

  it("parses explicit scheduler values", () => {
    // Arrange
    const environment = {
      OTTO_SCHEDULER_ENABLED: "1",
      OTTO_SCHEDULER_TICK_MS: "15000",
      OTTO_SCHEDULER_BATCH_SIZE: "5",
      OTTO_SCHEDULER_LOCK_LEASE_MS: "30000",
      OTTO_BACKGROUND_REQUEST_TIMEOUT_MS: "0",
      OTTO_BACKGROUND_STALL_TIMEOUT_MS: "900000",
      OTTO_BACKGROUND_TRANSIENT_RETRIES: "4",
      OTTO_BACKGROUND_RETRY_BASE_MS: "250",
      OTTO_BACKGROUND_RETRY_MAX_MS: "10000",
    }

    // Act
    const config = resolveSchedulerConfig(environment)

    // Assert
    expect(config).toEqual({
      enabled: true,
      tickMs: 15_000,
      batchSize: 5,
      lockLeaseMs: 30_000,
      background: {
        requestTimeoutMs: null,
        stallTimeoutMs: 900_000,
        transientRetryCount: 4,
        retryBaseMs: 250,
        retryMaxMs: 10_000,
      },
    })
  })

  it("parses non-zero background request timeout", () => {
    // Arrange
    const environment = {
      OTTO_BACKGROUND_REQUEST_TIMEOUT_MS: "120000",
    }

    // Act
    const config = resolveSchedulerConfig(environment)

    // Assert
    expect(config.background.requestTimeoutMs).toBe(120_000)
  })

  it("throws when lock lease is shorter than tick interval", () => {
    // Arrange
    const environment = {
      OTTO_SCHEDULER_TICK_MS: "60000",
      OTTO_SCHEDULER_LOCK_LEASE_MS: "50000",
    }

    // Act and Assert
    expect(() => resolveSchedulerConfig(environment)).toThrow("OTTO_SCHEDULER_LOCK_LEASE_MS")
  })
})
