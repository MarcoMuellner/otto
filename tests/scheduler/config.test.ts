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
    })
  })

  it("parses explicit scheduler values", () => {
    // Arrange
    const environment = {
      OTTO_SCHEDULER_ENABLED: "1",
      OTTO_SCHEDULER_TICK_MS: "15000",
      OTTO_SCHEDULER_BATCH_SIZE: "5",
      OTTO_SCHEDULER_LOCK_LEASE_MS: "30000",
    }

    // Act
    const config = resolveSchedulerConfig(environment)

    // Assert
    expect(config).toEqual({
      enabled: true,
      tickMs: 15_000,
      batchSize: 5,
      lockLeaseMs: 30_000,
    })
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
