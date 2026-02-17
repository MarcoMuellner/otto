import { createHash } from "node:crypto"

import { z } from "zod"

import type { FailedJobRunRecord, JobRecord } from "../persistence/repositories.js"
import { enqueueTelegramMessage } from "../telegram-worker/outbound-enqueue.js"

export const WATCHDOG_TASK_ID = "system-watchdog-failures"
export const WATCHDOG_TASK_TYPE = "watchdog_failures"
export const WATCHDOG_DEFAULT_CADENCE_MINUTES = 30
const WATCHDOG_MESSAGE_MAX_ITEMS = 10

const ensureWatchdogTaskInputSchema = z.object({
  cadenceMinutes: z
    .number()
    .int()
    .min(5)
    .max(24 * 60)
    .optional()
    .default(30),
  lookbackMinutes: z
    .number()
    .int()
    .min(5)
    .max(24 * 60)
    .optional()
    .default(120),
  maxFailures: z.number().int().min(1).max(200).optional().default(20),
  threshold: z.number().int().min(1).max(50).optional().default(2),
  chatId: z.number().int().positive().optional().nullable(),
})

export const watchdogPayloadSchema = z.object({
  lookbackMinutes: z
    .number()
    .int()
    .min(5)
    .max(24 * 60)
    .optional()
    .default(120),
  maxFailures: z.number().int().min(1).max(200).optional().default(20),
  threshold: z.number().int().min(1).max(50).optional().default(2),
  notify: z.boolean().optional().default(true),
  chatId: z.number().int().positive().optional().nullable(),
})

const checkTaskFailuresInputSchema = z.object({
  lookbackMinutes: z
    .number()
    .int()
    .min(5)
    .max(24 * 60)
    .optional()
    .default(120),
  maxFailures: z.number().int().min(1).max(200).optional().default(20),
  threshold: z.number().int().min(1).max(50).optional().default(2),
  notify: z.boolean().optional().default(false),
  chatId: z.number().int().positive().optional().nullable(),
  excludeTaskTypes: z.array(z.string().min(1)).optional().default([]),
})

type EnsureWatchdogTaskInput = z.input<typeof ensureWatchdogTaskInputSchema>
type CheckTaskFailuresInput = z.input<typeof checkTaskFailuresInputSchema>

type WatchdogJobsRepository = {
  getById: (jobId: string) => JobRecord | null
  createTask: (record: JobRecord) => void
}

type FailedRunsRepository = {
  listRecentFailedRuns: (sinceTimestamp: number, limit?: number) => FailedJobRunRecord[]
}

type OutboundMessagesRepository = {
  enqueueOrIgnoreDedupe: (record: {
    id: string
    dedupeKey: string | null
    chatId: number
    content: string
    priority: "low" | "normal" | "high"
    status: "queued"
    attemptCount: number
    nextAttemptAt: number
    sentAt: null
    failedAt: null
    errorMessage: null
    createdAt: number
    updatedAt: number
  }) => "enqueued" | "duplicate"
}

export type CheckTaskFailuresResult = {
  lookbackMinutes: number
  maxFailures: number
  threshold: number
  failedCount: number
  shouldAlert: boolean
  notified: boolean
  notificationStatus: "not_requested" | "enqueued" | "duplicate" | "no_chat_id"
  dedupeKey: string | null
  failures: FailedJobRunRecord[]
}

export type EnsureWatchdogTaskResult = {
  created: boolean
  taskId: string
  cadenceMinutes: number
}

/**
 * Resolves a default Telegram chat id for unattended watchdog alerts while remaining resilient
 * when Telegram runtime env vars are not configured.
 *
 * @param environment Process environment or test override.
 * @returns Telegram user/chat id if valid, otherwise null.
 */
export const resolveDefaultWatchdogChatId = (
  environment: NodeJS.ProcessEnv = process.env
): number | null => {
  const raw = environment.TELEGRAM_ALLOWED_USER_ID?.trim()
  if (!raw) {
    return null
  }

  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 1) {
    return null
  }

  return parsed
}

const buildWatchdogMessage = (
  failures: FailedJobRunRecord[],
  lookbackMinutes: number,
  threshold: number
): string => {
  const lines = failures.slice(0, WATCHDOG_MESSAGE_MAX_ITEMS).map((failure) => {
    const reason = failure.errorMessage ?? failure.errorCode ?? "unknown error"
    return `- ${failure.jobType} (${failure.jobId}): ${reason}`
  })

  return [
    `Watchdog alert: ${failures.length} failed task runs in last ${lookbackMinutes}m (threshold ${threshold}).`,
    ...lines,
  ].join("\n")
}

const buildWatchdogDedupeKey = (
  failures: FailedJobRunRecord[],
  lookbackMinutes: number,
  threshold: number
): string => {
  const fingerprint = failures.map((failure) => failure.runId).join("|")
  const hash = createHash("sha256").update(fingerprint).digest("hex").slice(0, 20)
  return `watchdog:task-failures:${lookbackMinutes}:${threshold}:${hash}`
}

/**
 * Ensures the system watchdog exists as a normal recurring task row so it survives restarts
 * and runs through the same scheduler semantics as user-defined tasks.
 *
 * @param jobsRepository Jobs persistence repository.
 * @param input Optional watchdog cadence and payload tuning.
 * @param now Timestamp source used for deterministic tests.
 * @returns Creation outcome and watchdog task id.
 */
export const ensureWatchdogTask = (
  jobsRepository: WatchdogJobsRepository,
  input: EnsureWatchdogTaskInput = {},
  now = Date.now
): EnsureWatchdogTaskResult => {
  const existing = jobsRepository.getById(WATCHDOG_TASK_ID)
  const parsedInput = ensureWatchdogTaskInputSchema.parse(input)

  if (existing) {
    return {
      created: false,
      taskId: WATCHDOG_TASK_ID,
      cadenceMinutes: parsedInput.cadenceMinutes,
    }
  }

  const createdAt = now()
  const firstRunAt = createdAt + parsedInput.cadenceMinutes * 60_000

  const payload = {
    lookbackMinutes: parsedInput.lookbackMinutes,
    maxFailures: parsedInput.maxFailures,
    threshold: parsedInput.threshold,
    notify: true,
    ...(parsedInput.chatId ? { chatId: parsedInput.chatId } : {}),
  }

  jobsRepository.createTask({
    id: WATCHDOG_TASK_ID,
    type: WATCHDOG_TASK_TYPE,
    status: "idle",
    scheduleType: "recurring",
    profileId: null,
    runAt: firstRunAt,
    cadenceMinutes: parsedInput.cadenceMinutes,
    payload: JSON.stringify(payload),
    lastRunAt: null,
    nextRunAt: firstRunAt,
    terminalState: null,
    terminalReason: null,
    lockToken: null,
    lockExpiresAt: null,
    createdAt,
    updatedAt: createdAt,
  })

  return {
    created: true,
    taskId: WATCHDOG_TASK_ID,
    cadenceMinutes: parsedInput.cadenceMinutes,
  }
}

/**
 * Evaluates recent failed task runs and optionally queues a dedupe-safe Telegram alert so
 * unattended failures remain visible without notification storms.
 *
 * @param dependencies Access to failed runs and outbound queue persistence.
 * @param input Lookback, threshold, and optional alerting controls.
 * @param now Timestamp source used for deterministic tests.
 * @returns Failure window summary plus notification outcome.
 */
export const checkTaskFailures = (
  dependencies: {
    jobsRepository: FailedRunsRepository
    outboundMessagesRepository: OutboundMessagesRepository
    defaultChatId: number | null
  },
  input: CheckTaskFailuresInput = {},
  now = Date.now
): CheckTaskFailuresResult => {
  const parsedInput = checkTaskFailuresInputSchema.parse(input)
  const nowTimestamp = now()
  const sinceTimestamp = nowTimestamp - parsedInput.lookbackMinutes * 60_000

  const failedRuns = dependencies.jobsRepository.listRecentFailedRuns(
    sinceTimestamp,
    parsedInput.maxFailures
  )
  const failures = failedRuns.filter((run) => !parsedInput.excludeTaskTypes.includes(run.jobType))

  const failedCount = failures.length
  const shouldAlert = failedCount >= parsedInput.threshold

  if (!parsedInput.notify || !shouldAlert) {
    return {
      lookbackMinutes: parsedInput.lookbackMinutes,
      maxFailures: parsedInput.maxFailures,
      threshold: parsedInput.threshold,
      failedCount,
      shouldAlert,
      notified: false,
      notificationStatus: "not_requested",
      dedupeKey: null,
      failures,
    }
  }

  const resolvedChatId = parsedInput.chatId ?? dependencies.defaultChatId
  if (!resolvedChatId) {
    return {
      lookbackMinutes: parsedInput.lookbackMinutes,
      maxFailures: parsedInput.maxFailures,
      threshold: parsedInput.threshold,
      failedCount,
      shouldAlert,
      notified: false,
      notificationStatus: "no_chat_id",
      dedupeKey: null,
      failures,
    }
  }

  const dedupeKey = buildWatchdogDedupeKey(
    failures,
    parsedInput.lookbackMinutes,
    parsedInput.threshold
  )
  const enqueueResult = enqueueTelegramMessage(
    {
      chatId: resolvedChatId,
      content: buildWatchdogMessage(failures, parsedInput.lookbackMinutes, parsedInput.threshold),
      dedupeKey,
      priority: "high",
    },
    dependencies.outboundMessagesRepository,
    nowTimestamp
  )

  return {
    lookbackMinutes: parsedInput.lookbackMinutes,
    maxFailures: parsedInput.maxFailures,
    threshold: parsedInput.threshold,
    failedCount,
    shouldAlert,
    notified: enqueueResult.status === "enqueued",
    notificationStatus: enqueueResult.status,
    dedupeKey,
    failures,
  }
}
