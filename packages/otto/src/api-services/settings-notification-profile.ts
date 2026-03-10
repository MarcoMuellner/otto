import { z } from "zod"

import type { UserProfileRecord } from "../persistence/repositories.js"
import { isValidIanaTimezone } from "../scheduler/notification-policy.js"

export const notificationTimeSchema = z
  .string()
  .trim()
  .regex(/^(?:[01]?\d|2[0-3]):[0-5]\d$/)

export const notificationProfileUpdateSchema = z
  .object({
    timezone: z
      .string()
      .trim()
      .min(1)
      .refine((value) => isValidIanaTimezone(value), "timezone must be a valid IANA timezone")
      .optional(),
    quietHoursStart: notificationTimeSchema.nullable().optional(),
    quietHoursEnd: notificationTimeSchema.nullable().optional(),
    interactiveContextWindowSize: z.number().int().min(5).max(200).optional(),
    contextRetentionCap: z.number().int().min(5).max(200).optional(),
    quietMode: z.enum(["critical_only", "off"]).optional(),
    muteUntil: z.number().int().nullable().optional(),
    muteForMinutes: z
      .number()
      .int()
      .min(1)
      .max(7 * 24 * 60)
      .optional(),
    watchdogAlertsEnabled: z.boolean().optional(),
    watchdogMuteUntil: z.number().int().nullable().optional(),
    watchdogMuteForMinutes: z
      .number()
      .int()
      .min(1)
      .max(7 * 24 * 60)
      .optional(),
    watchdogUnmute: z.boolean().optional(),
    markOnboardingComplete: z.boolean().optional(),
  })
  .superRefine((value, context) => {
    const watchdogMuteControls = [
      value.watchdogMuteUntil !== undefined,
      value.watchdogMuteForMinutes !== undefined,
      value.watchdogUnmute === true,
    ].filter(Boolean).length

    if (watchdogMuteControls > 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Provide only one of watchdogMuteUntil, watchdogMuteForMinutes, or watchdogUnmute in a single update",
        path: ["watchdogMuteUntil"],
      })
    }
  })

export type NotificationProfileUpdateInput = z.infer<typeof notificationProfileUpdateSchema>

const defaultNotificationProfile = (): UserProfileRecord => {
  return {
    timezone: "Europe/Vienna",
    quietHoursStart: "20:00",
    quietHoursEnd: "08:00",
    quietMode: "critical_only",
    muteUntil: null,
    watchdogAlertsEnabled: true,
    watchdogMuteUntil: null,
    interactiveContextWindowSize: 20,
    contextRetentionCap: 100,
    onboardingCompletedAt: null,
    lastDigestAt: null,
    updatedAt: Date.now(),
  }
}

export const resolveNotificationProfile = (userProfileRepository: {
  get: () => UserProfileRecord | null
}): UserProfileRecord => {
  const existing = userProfileRepository.get()
  if (!existing) {
    return defaultNotificationProfile()
  }

  return {
    ...existing,
    watchdogAlertsEnabled: existing.watchdogAlertsEnabled ?? true,
    watchdogMuteUntil: existing.watchdogMuteUntil ?? null,
  }
}

export const applyNotificationProfileUpdate = (
  existing: UserProfileRecord,
  input: NotificationProfileUpdateInput,
  now: number
): UserProfileRecord => {
  const muteUntil =
    input.muteForMinutes !== undefined
      ? now + input.muteForMinutes * 60_000
      : input.muteUntil !== undefined
        ? input.muteUntil
        : existing.muteUntil

  const watchdogMuteUntil =
    input.watchdogUnmute === true
      ? null
      : input.watchdogMuteForMinutes !== undefined
        ? now + input.watchdogMuteForMinutes * 60_000
        : input.watchdogMuteUntil !== undefined
          ? input.watchdogMuteUntil
          : (existing.watchdogMuteUntil ?? null)

  return {
    timezone: input.timezone ?? existing.timezone,
    quietHoursStart:
      input.quietHoursStart === undefined ? existing.quietHoursStart : input.quietHoursStart,
    quietHoursEnd: input.quietHoursEnd === undefined ? existing.quietHoursEnd : input.quietHoursEnd,
    quietMode: input.quietMode ?? existing.quietMode,
    muteUntil,
    watchdogAlertsEnabled: input.watchdogAlertsEnabled ?? existing.watchdogAlertsEnabled ?? true,
    watchdogMuteUntil,
    interactiveContextWindowSize:
      input.interactiveContextWindowSize ?? existing.interactiveContextWindowSize,
    contextRetentionCap: input.contextRetentionCap ?? existing.contextRetentionCap,
    onboardingCompletedAt: input.markOnboardingComplete ? now : existing.onboardingCompletedAt,
    lastDigestAt: existing.lastDigestAt,
    updatedAt: now,
  }
}

export const diffNotificationProfileFields = (
  before: UserProfileRecord,
  after: UserProfileRecord
): string[] => {
  const changed: string[] = []
  for (const key of Object.keys(after) as Array<keyof UserProfileRecord>) {
    if (before[key] !== after[key]) {
      changed.push(key)
    }
  }

  return changed
}
