import type { UserProfileRecord } from "../persistence/repositories.js"

export type NotificationUrgency = "normal" | "critical"

export type EffectiveNotificationProfile = {
  timezone: string
  quietHoursStart: string | null
  quietHoursEnd: string | null
  quietMode: "critical_only" | "off"
  muteUntil: number | null
  heartbeatMorning: string
  heartbeatMidday: string
  heartbeatEvening: string
  heartbeatCadenceMinutes: number
  heartbeatOnlyIfSignal: boolean
  onboardingCompletedAt: number | null
  lastDigestAt: number | null
}

export type NotificationGateDecision = {
  action: "deliver_now" | "hold"
  reason: "allowed" | "critical_bypass" | "quiet_hours" | "muted"
  releaseAt: number | null
}

const DEFAULT_TIMEZONE = "Europe/Vienna"
const DEFAULT_HEARTBEAT_MORNING = "08:30"
const DEFAULT_HEARTBEAT_MIDDAY = "12:30"
const DEFAULT_HEARTBEAT_EVENING = "19:00"
const DEFAULT_HEARTBEAT_CADENCE_MINUTES = 180
const QUIET_RELEASE_SEARCH_WINDOW_MS = 48 * 60 * 60 * 1000
const QUIET_RELEASE_STEP_MS = 60 * 1000

export const isValidIanaTimezone = (timezone: string): boolean => {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: timezone }).format(new Date())
    return true
  } catch {
    return false
  }
}

const parseClockMinutes = (value: string): number | null => {
  const normalized = value.trim()
  const match = /^(?:[01]?\d|2[0-3]):[0-5]\d$/.exec(normalized)
  if (!match) {
    return null
  }

  const [hours, minutes] = normalized.split(":")
  const parsedHours = Number(hours)
  const parsedMinutes = Number(minutes)
  if (!Number.isInteger(parsedHours) || !Number.isInteger(parsedMinutes)) {
    return null
  }

  return parsedHours * 60 + parsedMinutes
}

const getLocalClockMinutes = (timestamp: number, timezone: string): number => {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })

  const parts = formatter.formatToParts(new Date(timestamp))
  const hourPart = parts.find((part) => part.type === "hour")?.value ?? "00"
  const minutePart = parts.find((part) => part.type === "minute")?.value ?? "00"
  return Number(hourPart) * 60 + Number(minutePart)
}

const getLocalDateKey = (timestamp: number, timezone: string): string => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })

  return formatter.format(new Date(timestamp))
}

const isQuietHoursActive = (profile: EffectiveNotificationProfile, timestamp: number): boolean => {
  if (!profile.quietHoursStart || !profile.quietHoursEnd) {
    return false
  }

  const start = parseClockMinutes(profile.quietHoursStart)
  const end = parseClockMinutes(profile.quietHoursEnd)
  if (start == null || end == null || start === end) {
    return false
  }

  const current = getLocalClockMinutes(timestamp, profile.timezone)
  if (start < end) {
    return current >= start && current < end
  }

  return current >= start || current < end
}

const resolveQuietReleaseAt = (
  profile: EffectiveNotificationProfile,
  timestamp: number
): number => {
  const end = profile.quietHoursEnd
  if (!end) {
    return timestamp + 60 * 60 * 1000
  }

  const targetMinutes = parseClockMinutes(end)
  if (targetMinutes == null) {
    return timestamp + 60 * 60 * 1000
  }

  for (
    let candidate = timestamp + QUIET_RELEASE_STEP_MS;
    candidate <= timestamp + QUIET_RELEASE_SEARCH_WINDOW_MS;
    candidate += QUIET_RELEASE_STEP_MS
  ) {
    if (getLocalClockMinutes(candidate, profile.timezone) === targetMinutes) {
      return candidate
    }
  }

  return timestamp + 60 * 60 * 1000
}

export const resolveEffectiveNotificationProfile = (
  record: UserProfileRecord | null
): EffectiveNotificationProfile => {
  const rawTimezone = record?.timezone?.trim() || DEFAULT_TIMEZONE
  const timezone = isValidIanaTimezone(rawTimezone) ? rawTimezone : DEFAULT_TIMEZONE

  return {
    timezone,
    quietHoursStart: record?.quietHoursStart ?? null,
    quietHoursEnd: record?.quietHoursEnd ?? null,
    quietMode: record?.quietMode ?? "critical_only",
    muteUntil: record?.muteUntil ?? null,
    heartbeatMorning: record?.heartbeatMorning?.trim() || DEFAULT_HEARTBEAT_MORNING,
    heartbeatMidday: record?.heartbeatMidday?.trim() || DEFAULT_HEARTBEAT_MIDDAY,
    heartbeatEvening: record?.heartbeatEvening?.trim() || DEFAULT_HEARTBEAT_EVENING,
    heartbeatCadenceMinutes:
      record?.heartbeatCadenceMinutes && record.heartbeatCadenceMinutes >= 30
        ? record.heartbeatCadenceMinutes
        : DEFAULT_HEARTBEAT_CADENCE_MINUTES,
    heartbeatOnlyIfSignal: record?.heartbeatOnlyIfSignal ?? true,
    onboardingCompletedAt: record?.onboardingCompletedAt ?? null,
    lastDigestAt: record?.lastDigestAt ?? null,
  }
}

export const isProfileOnboardingComplete = (record: UserProfileRecord | null): boolean => {
  if (record?.onboardingCompletedAt != null) {
    return true
  }

  return Boolean(record?.timezone && record?.quietHoursStart && record?.quietHoursEnd)
}

export const resolveNotificationGateDecision = (
  profile: EffectiveNotificationProfile,
  urgency: NotificationUrgency,
  timestamp: number
): NotificationGateDecision => {
  if (urgency === "critical") {
    return {
      action: "deliver_now",
      reason: "critical_bypass",
      releaseAt: null,
    }
  }

  if (profile.muteUntil && profile.muteUntil > timestamp) {
    return {
      action: "hold",
      reason: "muted",
      releaseAt: profile.muteUntil,
    }
  }

  const quietActive = isQuietHoursActive(profile, timestamp)
  if (profile.quietMode === "critical_only" && quietActive) {
    return {
      action: "hold",
      reason: "quiet_hours",
      releaseAt: resolveQuietReleaseAt(profile, timestamp),
    }
  }

  return {
    action: "deliver_now",
    reason: "allowed",
    releaseAt: null,
  }
}

export const isQuietHoursNow = (
  profile: EffectiveNotificationProfile,
  timestamp: number
): boolean => {
  return isQuietHoursActive(profile, timestamp)
}

export const getLocalDateFingerprint = (
  profile: EffectiveNotificationProfile,
  timestamp: number
): string => {
  return getLocalDateKey(timestamp, profile.timezone)
}

export const getLocalClockMinutesInProfileTimezone = (
  profile: EffectiveNotificationProfile,
  timestamp: number
): number => {
  return getLocalClockMinutes(timestamp, profile.timezone)
}
