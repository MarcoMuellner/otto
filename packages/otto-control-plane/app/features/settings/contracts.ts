import { z } from "zod"

const isValidIanaTimezone = (value: string): boolean => {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: value })
    return true
  } catch {
    return false
  }
}

export const notificationProfileSchema = z.object({
  timezone: z.string().nullable(),
  quietHoursStart: z.string().nullable(),
  quietHoursEnd: z.string().nullable(),
  quietMode: z.enum(["critical_only", "off"]).nullable(),
  muteUntil: z.number().int().nullable(),
  watchdogAlertsEnabled: z.boolean(),
  watchdogMuteUntil: z.number().int().nullable(),
  interactiveContextWindowSize: z.number().int().min(5).max(200),
  contextRetentionCap: z.number().int().min(5).max(200),
  onboardingCompletedAt: z.number().int().nullable(),
  lastDigestAt: z.number().int().nullable(),
  updatedAt: z.number().int(),
})

export const notificationProfileResponseSchema = z.object({
  profile: notificationProfileSchema,
})

export const updateNotificationProfileRequestSchema = z.object({
  timezone: z
    .string()
    .trim()
    .min(1)
    .refine((value) => isValidIanaTimezone(value), "timezone must be a valid IANA timezone")
    .optional(),
  quietHoursStart: z.string().trim().nullable().optional(),
  quietHoursEnd: z.string().trim().nullable().optional(),
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

export const updateNotificationProfileResponseSchema = z.object({
  profile: notificationProfileSchema,
  changedFields: z.array(z.string().min(1)),
})

export type NotificationProfile = z.infer<typeof notificationProfileSchema>
export type NotificationProfileResponse = z.infer<typeof notificationProfileResponseSchema>
export type UpdateNotificationProfileRequest = z.infer<
  typeof updateNotificationProfileRequestSchema
>
export type UpdateNotificationProfileResponse = z.infer<
  typeof updateNotificationProfileResponseSchema
>
