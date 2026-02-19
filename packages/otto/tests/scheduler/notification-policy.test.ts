import { describe, expect, it } from "vitest"

import {
  isProfileOnboardingComplete,
  isValidIanaTimezone,
  resolveEffectiveNotificationProfile,
  resolveNotificationGateDecision,
} from "../../src/scheduler/notification-policy.js"

describe("notification policy", () => {
  it("holds normal notifications during quiet hours", () => {
    // Arrange
    const profile = resolveEffectiveNotificationProfile({
      timezone: "Europe/Vienna",
      quietHoursStart: "20:00",
      quietHoursEnd: "08:00",
      quietMode: "critical_only",
      muteUntil: null,
      heartbeatMorning: "08:30",
      heartbeatMidday: "12:30",
      heartbeatEvening: "19:00",
      heartbeatCadenceMinutes: 180,
      heartbeatOnlyIfSignal: true,
      onboardingCompletedAt: null,
      lastDigestAt: null,
      updatedAt: Date.now(),
    })
    const now = new Date("2026-02-20T22:15:00+01:00").getTime()

    // Act
    const decision = resolveNotificationGateDecision(profile, "normal", now)

    // Assert
    expect(decision.action).toBe("hold")
    expect(decision.reason).toBe("quiet_hours")
  })

  it("lets critical notifications bypass quiet and mute", () => {
    // Arrange
    const now = Date.now()
    const profile = resolveEffectiveNotificationProfile({
      timezone: "Europe/Vienna",
      quietHoursStart: "20:00",
      quietHoursEnd: "08:00",
      quietMode: "critical_only",
      muteUntil: now + 60_000,
      heartbeatMorning: "08:30",
      heartbeatMidday: "12:30",
      heartbeatEvening: "19:00",
      heartbeatCadenceMinutes: 180,
      heartbeatOnlyIfSignal: true,
      onboardingCompletedAt: null,
      lastDigestAt: null,
      updatedAt: now,
    })

    // Act
    const decision = resolveNotificationGateDecision(profile, "critical", now)

    // Assert
    expect(decision).toMatchObject({
      action: "deliver_now",
      reason: "critical_bypass",
    })
  })

  it("falls back to default timezone when configured timezone is invalid", () => {
    // Arrange
    const profile = resolveEffectiveNotificationProfile({
      timezone: "Europe/InvalidCity",
      quietHoursStart: "20:00",
      quietHoursEnd: "08:00",
      quietMode: "critical_only",
      muteUntil: null,
      heartbeatMorning: "08:30",
      heartbeatMidday: "12:30",
      heartbeatEvening: "19:00",
      heartbeatCadenceMinutes: 180,
      heartbeatOnlyIfSignal: true,
      onboardingCompletedAt: null,
      lastDigestAt: null,
      updatedAt: Date.now(),
    })

    // Assert
    expect(profile.timezone).toBe("Europe/Vienna")
    expect(isValidIanaTimezone(profile.timezone)).toBe(true)
  })

  it("treats onboarding as complete when completion timestamp is set", () => {
    // Arrange
    const completed = {
      timezone: null,
      quietHoursStart: null,
      quietHoursEnd: null,
      quietMode: "critical_only" as const,
      muteUntil: null,
      heartbeatMorning: "08:30",
      heartbeatMidday: "12:30",
      heartbeatEvening: "19:00",
      heartbeatCadenceMinutes: 180,
      heartbeatOnlyIfSignal: true,
      onboardingCompletedAt: Date.now(),
      lastDigestAt: null,
      updatedAt: Date.now(),
    }

    // Act
    const result = isProfileOnboardingComplete(completed)

    // Assert
    expect(result).toBe(true)
  })
})
