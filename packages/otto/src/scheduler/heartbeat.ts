import { createHash } from "node:crypto"

import { z } from "zod"

import type {
  JobRecord,
  JobRunSummaryRecord,
  UserProfileRecord,
} from "../persistence/repositories.js"
import { enqueueTelegramMessage } from "../telegram-worker/outbound-enqueue.js"
import {
  getLocalClockMinutesInProfileTimezone,
  getLocalDateFingerprint,
  isProfileOnboardingComplete,
  resolveEffectiveNotificationProfile,
  resolveNotificationGateDecision,
} from "./notification-policy.js"

export const HEARTBEAT_TASK_ID = "system-heartbeat"
export const HEARTBEAT_TASK_TYPE = "heartbeat"
export const HEARTBEAT_DEFAULT_CADENCE_MINUTES = 1

const ensureHeartbeatTaskInputSchema = z.object({
  cadenceMinutes: z.number().int().min(1).max(60).optional().default(1),
  chatId: z.number().int().positive().optional().nullable(),
})

const heartbeatPayloadSchema = z.object({
  chatId: z.number().int().positive().optional().nullable(),
})

type EnsureHeartbeatTaskInput = z.input<typeof ensureHeartbeatTaskInputSchema>

type HeartbeatTaskJobsRepository = {
  getById: (jobId: string) => JobRecord | null
  createTask: (record: JobRecord) => void
}

type HeartbeatExecutionJobsRepository = {
  listRecentRuns: (sinceTimestamp: number, limit?: number) => JobRunSummaryRecord[]
}

type OutboundMessagesRepository = {
  enqueueOrIgnoreDedupe: (record: {
    id: string
    dedupeKey: string | null
    chatId: number
    content: string
    priority: "low" | "normal" | "high" | "critical"
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

type UserProfileRepository = {
  get: () => UserProfileRecord | null
  setLastDigestAt: (lastDigestAt: number, updatedAt?: number) => void
}

export type EnsureHeartbeatTaskResult = {
  created: boolean
  taskId: string
  cadenceMinutes: number
}

export type HeartbeatExecutionResult = {
  status: "success"
  summary: string
  emitted: boolean
  digestEmitted: boolean
  onboardingPrompted: boolean
  reason:
    | "onboarding_needed"
    | "outside_windows"
    | "outside_cadence"
    | "dedupe"
    | "signal_empty"
    | "quiet_or_muted"
    | "queued"
}

const buildWindowFingerprint = (
  timezoneDate: string,
  windowKey: "morning" | "midday" | "evening"
): string => {
  return `${timezoneDate}:${windowKey}`
}

const buildDeduplicateKey = (
  kind: "heartbeat" | "heartbeat-onboarding" | "heartbeat-digest",
  chatId: number,
  fingerprint: string
): string => {
  const hash = createHash("sha256").update(`${chatId}:${fingerprint}`).digest("hex").slice(0, 16)
  return `${kind}:${hash}`
}

const summarizeRuns = (runs: JobRunSummaryRecord[]): string => {
  if (runs.length === 0) {
    return "No task activity in the recent window."
  }

  const successCount = runs.filter((run) => run.status === "success").length
  const failedCount = runs.filter((run) => run.status === "failed").length
  const skippedCount = runs.filter((run) => run.status === "skipped").length
  const byType = new Map<string, number>()

  for (const run of runs) {
    byType.set(run.jobType, (byType.get(run.jobType) ?? 0) + 1)
  }

  const topTypes = [...byType.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([type, count]) => `${type} (${count})`)
    .join(", ")

  const errorHighlights = runs
    .filter((run) => run.status === "failed")
    .slice(0, 2)
    .map((run) => run.errorMessage ?? run.errorCode ?? "Unknown failure")

  const lines = [
    `Recent task activity: ${runs.length} runs (${successCount} success, ${failedCount} failed, ${skippedCount} skipped).`,
    topTypes.length > 0 ? `Most active: ${topTypes}.` : null,
    errorHighlights.length > 0 ? `Top issues: ${errorHighlights.join(" | ")}.` : null,
  ].filter((line): line is string => Boolean(line))

  return lines.join("\n")
}

const parseWindowMinutes = (value: string): number | null => {
  const normalized = value.trim()
  const match = /^(?:[01]?\d|2[0-3]):[0-5]\d$/.exec(normalized)
  if (!match) {
    return null
  }

  const [hours, minutes] = normalized.split(":")
  return Number(hours) * 60 + Number(minutes)
}

const resolveDueWindow = (
  nowMinutes: number,
  profile: ReturnType<typeof resolveEffectiveNotificationProfile>
): "morning" | "midday" | "evening" | null => {
  const windows: Array<{ key: "morning" | "midday" | "evening"; value: string }> = [
    { key: "morning", value: profile.heartbeatMorning },
    { key: "midday", value: profile.heartbeatMidday },
    { key: "evening", value: profile.heartbeatEvening },
  ]

  for (const window of windows) {
    const windowMinutes = parseWindowMinutes(window.value)
    if (windowMinutes == null) {
      continue
    }

    if (nowMinutes >= windowMinutes && nowMinutes <= windowMinutes + 59) {
      return window.key
    }
  }

  return null
}

const resolveCadenceBucket = (
  nowTimestamp: number,
  cadenceMinutes: number
): { key: string; active: boolean } => {
  const cadenceMs = cadenceMinutes * 60_000
  const bucket = Math.floor(nowTimestamp / cadenceMs)
  const nextBoundary = (bucket + 1) * cadenceMs
  const boundaryDistance = nextBoundary - nowTimestamp

  return {
    key: `cadence-${cadenceMinutes}-${bucket}`,
    active: boundaryDistance <= 60_000,
  }
}

export const ensureHeartbeatTask = (
  jobsRepository: HeartbeatTaskJobsRepository,
  input: EnsureHeartbeatTaskInput = {},
  now = Date.now
): EnsureHeartbeatTaskResult => {
  const parsedInput = ensureHeartbeatTaskInputSchema.parse(input)
  const existing = jobsRepository.getById(HEARTBEAT_TASK_ID)
  if (existing) {
    return {
      created: false,
      taskId: HEARTBEAT_TASK_ID,
      cadenceMinutes: parsedInput.cadenceMinutes,
    }
  }

  const createdAt = now()
  const firstRunAt = createdAt + parsedInput.cadenceMinutes * 60_000

  jobsRepository.createTask({
    id: HEARTBEAT_TASK_ID,
    type: HEARTBEAT_TASK_TYPE,
    status: "idle",
    scheduleType: "recurring",
    profileId: null,
    runAt: firstRunAt,
    cadenceMinutes: parsedInput.cadenceMinutes,
    payload: JSON.stringify({
      chatId: parsedInput.chatId ?? null,
    }),
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
    taskId: HEARTBEAT_TASK_ID,
    cadenceMinutes: parsedInput.cadenceMinutes,
  }
}

export const executeHeartbeatTask = (
  dependencies: {
    jobsRepository: HeartbeatExecutionJobsRepository
    outboundMessagesRepository: OutboundMessagesRepository
    userProfileRepository: UserProfileRepository
    defaultChatId: number | null
  },
  jobPayload: string | null,
  startedAt: number
): HeartbeatExecutionResult => {
  const payloadParsed = heartbeatPayloadSchema.safeParse(
    jobPayload ? JSON.parse(jobPayload) : { chatId: null }
  )
  const chatId = payloadParsed.success
    ? (payloadParsed.data.chatId ?? dependencies.defaultChatId)
    : dependencies.defaultChatId

  if (!chatId) {
    return {
      status: "success",
      summary: "Heartbeat skipped because no chat id is configured.",
      emitted: false,
      digestEmitted: false,
      onboardingPrompted: false,
      reason: "signal_empty",
    }
  }

  const profileRecord = dependencies.userProfileRepository.get()
  const profile = resolveEffectiveNotificationProfile(profileRecord)
  const nowMinutes = getLocalClockMinutesInProfileTimezone(profile, startedAt)
  const timezoneDate = getLocalDateFingerprint(profile, startedAt)

  if (!isProfileOnboardingComplete(profileRecord)) {
    const onboardingText = [
      "I can start friendly heartbeat updates, but your notification profile is not configured yet.",
      "Suggested defaults: timezone Europe/Vienna, quiet hours 20:00-08:00, and morning/midday/evening heartbeats at 08:30 / 12:30 / 19:00.",
      "Tell me in plain language what you prefer, for example: 'mute until tomorrow 08:00', 'quiet hours 21:00-07:30', or 'only notify me when there is meaningful change'.",
    ].join("\n")

    const result = enqueueTelegramMessage(
      {
        chatId,
        content: onboardingText,
        dedupeKey: buildDeduplicateKey(
          "heartbeat-onboarding",
          chatId,
          `${timezoneDate}:onboarding`
        ),
        priority: "normal",
      },
      dependencies.outboundMessagesRepository,
      startedAt
    )

    return {
      status: "success",
      summary: `Heartbeat onboarding prompt ${result.status}.`,
      emitted: result.status === "enqueued",
      digestEmitted: false,
      onboardingPrompted: true,
      reason: "onboarding_needed",
    }
  }

  const window = resolveDueWindow(nowMinutes, profile)
  const cadenceBucket = resolveCadenceBucket(startedAt, profile.heartbeatCadenceMinutes)
  if (!window && !cadenceBucket.active) {
    return {
      status: "success",
      summary: "Heartbeat skipped because no window or cadence slot is currently due.",
      emitted: false,
      digestEmitted: false,
      onboardingPrompted: false,
      reason: "outside_cadence",
    }
  }

  const signalLookbackMinutes = profile.heartbeatCadenceMinutes
  const since = startedAt - signalLookbackMinutes * 60_000
  const recentRuns = dependencies.jobsRepository
    .listRecentRuns(since, 100)
    .filter((run) => run.jobType !== HEARTBEAT_TASK_TYPE)

  if (profile.heartbeatOnlyIfSignal && recentRuns.length === 0) {
    return {
      status: "success",
      summary: "Heartbeat skipped because there is no new signal to report.",
      emitted: false,
      digestEmitted: false,
      onboardingPrompted: false,
      reason: "signal_empty",
    }
  }

  const gate = resolveNotificationGateDecision(profile, "normal", startedAt)
  if (gate.action === "hold") {
    return {
      status: "success",
      summary: "Heartbeat held due to current quiet or mute policy.",
      emitted: false,
      digestEmitted: false,
      onboardingPrompted: false,
      reason: "quiet_or_muted",
    }
  }

  const fingerprint = window
    ? buildWindowFingerprint(timezoneDate, window)
    : `${timezoneDate}:${cadenceBucket.key}`
  const heartbeatHeader = window
    ? `Friendly ${window} heartbeat:`
    : `Friendly heartbeat (${profile.heartbeatCadenceMinutes} minute cadence):`
  const heartbeatContent = [heartbeatHeader, summarizeRuns(recentRuns)].join("\n")

  const enqueueResult = enqueueTelegramMessage(
    {
      chatId,
      content: heartbeatContent,
      dedupeKey: buildDeduplicateKey("heartbeat", chatId, fingerprint),
      priority: "normal",
    },
    dependencies.outboundMessagesRepository,
    startedAt
  )

  dependencies.userProfileRepository.setLastDigestAt(startedAt, startedAt)

  return {
    status: "success",
    summary: window
      ? `Heartbeat ${enqueueResult.status} for ${window} window.`
      : `Heartbeat ${enqueueResult.status} for cadence window.`,
    emitted: enqueueResult.status === "enqueued",
    digestEmitted: false,
    onboardingPrompted: false,
    reason: enqueueResult.status === "duplicate" ? "dedupe" : "queued",
  }
}
