import { describe, expect, it } from "vitest"

import { resolveScheduleTransition } from "../../src/scheduler/schedule.js"

describe("resolveScheduleTransition", () => {
  it("reschedules recurring jobs using cadence minutes", () => {
    // Arrange
    const job = {
      id: "job-1",
      scheduleType: "recurring" as const,
      cadenceMinutes: 30,
    }

    // Act
    const transition = resolveScheduleTransition(job, 10_000)

    // Assert
    expect(transition).toEqual({
      mode: "reschedule",
      lastRunAt: 10_000,
      nextRunAt: 1_810_000,
    })
  })

  it("finalizes one-shot jobs after completion", () => {
    // Arrange
    const job = {
      id: "job-2",
      scheduleType: "oneshot" as const,
      cadenceMinutes: null,
    }

    // Act
    const transition = resolveScheduleTransition(job, 20_000)

    // Assert
    expect(transition).toEqual({
      mode: "finalize",
      terminalState: "completed",
      terminalReason: null,
      lastRunAt: 20_000,
    })
  })

  it("throws when recurring cadence is missing", () => {
    // Arrange
    const job = {
      id: "job-3",
      scheduleType: "recurring" as const,
      cadenceMinutes: null,
    }

    // Act and Assert
    expect(() => resolveScheduleTransition(job, 20_000)).toThrow("invalid cadenceMinutes")
  })
})
