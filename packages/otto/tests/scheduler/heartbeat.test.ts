import { describe, expect, it, vi } from "vitest"

import type { UserProfileRecord } from "../../src/persistence/index.js"
import { executeHeartbeatTask } from "../../src/scheduler/heartbeat.js"

const MIDDAY_TIMESTAMP = Date.parse("2026-02-21T11:35:00.000Z")

const createProfile = (overrides: Partial<UserProfileRecord> = {}): UserProfileRecord => {
  return {
    timezone: "Europe/Vienna",
    quietHoursStart: "20:00",
    quietHoursEnd: "08:00",
    quietMode: "off",
    muteUntil: null,
    heartbeatMorning: "08:30",
    heartbeatMidday: "12:30",
    heartbeatEvening: "19:00",
    heartbeatCadenceMinutes: 180,
    heartbeatOnlyIfSignal: false,
    onboardingCompletedAt: 1,
    lastDigestAt: null,
    updatedAt: 1,
    ...overrides,
  }
}

describe("executeHeartbeatTask", () => {
  it("emits a compact midday heartbeat without leaking long task prompts", () => {
    // Arrange
    const outboundCalls: Array<{ content: string }> = []
    const longLueftenType =
      "Every run: check Home Assistant indoor humidity/temperature and decide if Marco should ventilate (lueften) or close windows. Use home-assistant_GetLiveContext to read entities."

    const runs = [
      ...Array.from({ length: 8 }, (_, index) => ({
        runId: `run-l-${index}`,
        jobId: `job-l-${index}`,
        jobType: longLueftenType,
        startedAt: MIDDAY_TIMESTAMP - 5_000,
        finishedAt: MIDDAY_TIMESTAMP - 4_000,
        status: "success" as const,
        errorCode: null,
        errorMessage: null,
        resultJson: null,
      })),
      ...Array.from({ length: 6 }, (_, index) => ({
        runId: `run-w-${index}`,
        jobId: `job-w-${index}`,
        jobType: "watchdog_failures",
        startedAt: MIDDAY_TIMESTAMP - 3_000,
        finishedAt: MIDDAY_TIMESTAMP - 2_000,
        status: "success" as const,
        errorCode: null,
        errorMessage: null,
        resultJson: null,
      })),
      {
        runId: "run-g-1",
        jobId: "job-g-1",
        jobType: "Every run: track Geizhals prices and alert on big jumps.",
        startedAt: MIDDAY_TIMESTAMP - 1_000,
        finishedAt: MIDDAY_TIMESTAMP - 500,
        status: "success" as const,
        errorCode: null,
        errorMessage: null,
        resultJson: null,
      },
    ]

    // Act
    const result = executeHeartbeatTask(
      {
        jobsRepository: {
          listRecentRuns: () => runs,
        },
        outboundMessagesRepository: {
          enqueueOrIgnoreDedupe: (record) => {
            outboundCalls.push({ content: record.content })
            return "enqueued"
          },
        },
        userProfileRepository: {
          get: () => createProfile(),
          setLastDigestAt: vi.fn(),
        },
        defaultChatId: 8334178095,
      },
      JSON.stringify({ chatId: 8334178095 }),
      MIDDAY_TIMESTAMP
    )

    // Assert
    expect(result.emitted).toBe(true)
    expect(outboundCalls).toHaveLength(1)
    const content = outboundCalls[0]?.content ?? ""
    expect(content).toContain("Mittag-Update:")
    expect(content).toContain("Status: 15 Laeufe (15 ok, 0 Fehler, 0 uebersprungen).")
    expect(content).toContain("Aktion: keine.")
    expect(content).toContain("Aktiv: Lueften-Check (8) | Watchdog (6) | Geizhals (1).")
    expect(content).not.toContain("home-assistant_GetLiveContext")
  })

  it("still emits compact heartbeat with no recent runs when signal-only is disabled", () => {
    // Arrange
    const outboundCalls: Array<{ content: string }> = []

    // Act
    const result = executeHeartbeatTask(
      {
        jobsRepository: {
          listRecentRuns: () => [],
        },
        outboundMessagesRepository: {
          enqueueOrIgnoreDedupe: (record) => {
            outboundCalls.push({ content: record.content })
            return "enqueued"
          },
        },
        userProfileRepository: {
          get: () => createProfile({ heartbeatOnlyIfSignal: false }),
          setLastDigestAt: vi.fn(),
        },
        defaultChatId: 8334178095,
      },
      JSON.stringify({ chatId: 8334178095 }),
      MIDDAY_TIMESTAMP
    )

    // Assert
    expect(result.emitted).toBe(true)
    expect(outboundCalls).toHaveLength(1)
    expect(outboundCalls[0]?.content).toContain("Status: keine neuen Laeufe.")
    expect(outboundCalls[0]?.content).toContain("Aktion: keine.")
  })
})
