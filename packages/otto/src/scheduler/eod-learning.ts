import { z } from "zod"

import type { JobRecord } from "../persistence/repositories.js"
import { isValidIanaTimezone } from "./notification-policy.js"

export const EOD_LEARNING_TASK_ID = "system-daily-eod-learning"
export const EOD_LEARNING_TASK_TYPE = "eod_learning_daily"
export const EOD_LEARNING_DEFAULT_CADENCE_MINUTES = 24 * 60
export const EOD_LEARNING_DEFAULT_TIMEZONE = "Europe/Vienna"

const NEXT_MIDNIGHT_SEARCH_WINDOW_MS = 48 * 60 * 60 * 1000
const NEXT_MIDNIGHT_SEARCH_STEP_MS = 60 * 1000

const ensureEodLearningTaskInputSchema = z.object({
  timezone: z.string().trim().min(1).optional().nullable(),
  cadenceMinutes: z
    .number()
    .int()
    .min(60)
    .max(7 * 24 * 60)
    .optional()
    .default(EOD_LEARNING_DEFAULT_CADENCE_MINUTES),
})

type EnsureEodLearningTaskInput = z.input<typeof ensureEodLearningTaskInputSchema>

type EodLearningJobsRepository = {
  getById: (jobId: string) => JobRecord | null
  createTask: (record: JobRecord) => void
}

const eodLearningTaskPayloadSchema = z
  .object({
    timezone: z.string().trim().min(1).optional(),
  })
  .passthrough()

export type EnsureEodLearningTaskResult = {
  created: boolean
  taskId: string
  cadenceMinutes: number
  timezone: string
  nextRunAt: number
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

/**
 * Resolves a timezone for EOD scheduling from optional user/profile input, with a stable
 * fallback when the input is missing or invalid.
 *
 * @param rawTimezone Optional timezone candidate.
 * @returns Valid IANA timezone used by scheduler bootstrap.
 */
export const resolveEodLearningTimezone = (rawTimezone?: string | null): string => {
  const candidate = rawTimezone?.trim()
  if (candidate && isValidIanaTimezone(candidate)) {
    return candidate
  }

  return EOD_LEARNING_DEFAULT_TIMEZONE
}

/**
 * Computes the next local midnight timestamp for a timezone by scanning forward minute-by-minute.
 * The search keeps local-clock semantics correct across DST boundaries.
 *
 * @param timezone Valid IANA timezone.
 * @param nowTimestamp Anchor timestamp in milliseconds.
 * @returns UTC timestamp for the next 00:00 in timezone-local time.
 */
export const resolveNextLocalMidnightTimestamp = (
  timezone: string,
  nowTimestamp: number
): number => {
  const localDateKeyNow = getLocalDateKey(nowTimestamp, timezone)

  for (
    let candidate = nowTimestamp + NEXT_MIDNIGHT_SEARCH_STEP_MS;
    candidate <= nowTimestamp + NEXT_MIDNIGHT_SEARCH_WINDOW_MS;
    candidate += NEXT_MIDNIGHT_SEARCH_STEP_MS
  ) {
    const isNextLocalDate = getLocalDateKey(candidate, timezone) !== localDateKeyNow
    if (!isNextLocalDate) {
      continue
    }

    if (getLocalClockMinutes(candidate, timezone) === 0) {
      return candidate
    }
  }

  return nowTimestamp + EOD_LEARNING_DEFAULT_CADENCE_MINUTES * 60_000
}

/**
 * Ensures the nightly EOD system task exists so runtime startup always has a recurring anchor
 * for daily learning orchestration.
 *
 * @param jobsRepository Jobs persistence repository.
 * @param input Optional timezone/cadence overrides.
 * @param now Timestamp source for deterministic tests.
 * @returns Creation outcome with timezone and next-run timestamp context.
 */
export const ensureEodLearningTask = (
  jobsRepository: EodLearningJobsRepository,
  input: EnsureEodLearningTaskInput = {},
  now = Date.now
): EnsureEodLearningTaskResult => {
  const existing = jobsRepository.getById(EOD_LEARNING_TASK_ID)
  const parsedInput = ensureEodLearningTaskInputSchema.parse(input)
  const timezone = resolveEodLearningTimezone(parsedInput.timezone)
  const nowTimestamp = now()
  const nextRunAt = resolveNextLocalMidnightTimestamp(timezone, nowTimestamp)

  if (existing) {
    const persistedTimezone = resolvePersistedEodLearningTimezone(existing.payload)
    const effectiveTimezone = persistedTimezone ?? timezone

    return {
      created: false,
      taskId: EOD_LEARNING_TASK_ID,
      cadenceMinutes: existing.cadenceMinutes ?? parsedInput.cadenceMinutes,
      timezone: effectiveTimezone,
      nextRunAt: existing.nextRunAt ?? nextRunAt,
    }
  }

  const payload = {
    timezone,
  }

  jobsRepository.createTask({
    id: EOD_LEARNING_TASK_ID,
    type: EOD_LEARNING_TASK_TYPE,
    status: "idle",
    scheduleType: "recurring",
    profileId: null,
    modelRef: null,
    runAt: nextRunAt,
    cadenceMinutes: parsedInput.cadenceMinutes,
    payload: JSON.stringify(payload),
    lastRunAt: null,
    nextRunAt,
    terminalState: null,
    terminalReason: null,
    lockToken: null,
    lockExpiresAt: null,
    createdAt: nowTimestamp,
    updatedAt: nowTimestamp,
  })

  return {
    created: true,
    taskId: EOD_LEARNING_TASK_ID,
    cadenceMinutes: parsedInput.cadenceMinutes,
    timezone,
    nextRunAt,
  }
}

const resolvePersistedEodLearningTimezone = (rawPayload: string | null): string | null => {
  if (!rawPayload) {
    return null
  }

  try {
    const parsedPayload = JSON.parse(rawPayload)
    const payload = eodLearningTaskPayloadSchema.safeParse(parsedPayload)
    if (!payload.success) {
      return null
    }

    return resolveEodLearningTimezone(payload.data.timezone)
  } catch {
    return null
  }
}
