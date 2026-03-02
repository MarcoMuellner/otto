import { describe, expect, it } from "vitest"

import {
  applyNotificationProfileUpdate,
  diffNotificationProfileFields,
  notificationProfileUpdateSchema,
  resolveNotificationProfile,
} from "../../src/api-services/settings-notification-profile.js"

describe("settings-notification-profile service", () => {
  it("returns defaults when repository has no profile", () => {
    // Act
    const profile = resolveNotificationProfile({
      get: () => null,
    })

    // Assert
    expect(profile).toMatchObject({
      timezone: "Europe/Vienna",
      quietHoursStart: "20:00",
      quietHoursEnd: "08:00",
      quietMode: "critical_only",
      heartbeatOnlyIfSignal: true,
      interactiveContextWindowSize: 20,
      contextRetentionCap: 100,
    })
  })

  it("merges update fields and computes changed keys", () => {
    // Arrange
    const existing = resolveNotificationProfile({
      get: () => null,
    })
    const now = 1_700_000_000_000

    // Act
    const merged = applyNotificationProfileUpdate(
      existing,
      {
        quietHoursStart: "21:00",
        quietHoursEnd: "07:30",
        muteForMinutes: 10,
        interactiveContextWindowSize: 55,
        contextRetentionCap: 77,
      },
      now
    )
    const changed = diffNotificationProfileFields(existing, merged)

    // Assert
    expect(merged.quietHoursStart).toBe("21:00")
    expect(merged.quietHoursEnd).toBe("07:30")
    expect(merged.muteUntil).toBe(now + 10 * 60_000)
    expect(changed).toContain("quietHoursStart")
    expect(changed).toContain("quietHoursEnd")
    expect(changed).toContain("muteUntil")
    expect(merged.interactiveContextWindowSize).toBe(55)
    expect(merged.contextRetentionCap).toBe(77)
    expect(changed).toContain("interactiveContextWindowSize")
    expect(changed).toContain("contextRetentionCap")
  })

  it("rejects invalid timezone in update payload", () => {
    // Act + Assert
    expect(() =>
      notificationProfileUpdateSchema.parse({
        timezone: "Europe/NopeTown",
      })
    ).toThrow()
  })

  it("rejects out-of-range context window and retention cap", () => {
    expect(() =>
      notificationProfileUpdateSchema.parse({
        interactiveContextWindowSize: 4,
      })
    ).toThrow()

    expect(() =>
      notificationProfileUpdateSchema.parse({
        contextRetentionCap: 201,
      })
    ).toThrow()
  })
})
