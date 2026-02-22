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
  heartbeatMorning: z.string().nullable(),
  heartbeatMidday: z.string().nullable(),
  heartbeatEvening: z.string().nullable(),
  heartbeatCadenceMinutes: z.number().int().nullable(),
  heartbeatOnlyIfSignal: z.boolean(),
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
  heartbeatMorning: z.string().trim().nullable().optional(),
  heartbeatMidday: z.string().trim().nullable().optional(),
  heartbeatEvening: z.string().trim().nullable().optional(),
  heartbeatCadenceMinutes: z
    .number()
    .int()
    .min(30)
    .max(24 * 60)
    .nullable()
    .optional(),
  heartbeatOnlyIfSignal: z.boolean().optional(),
  quietMode: z.enum(["critical_only", "off"]).optional(),
  muteUntil: z.number().int().nullable().optional(),
  muteForMinutes: z
    .number()
    .int()
    .min(1)
    .max(7 * 24 * 60)
    .optional(),
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
