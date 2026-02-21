import type { Logger } from "pino"
import { rm } from "node:fs/promises"

import type { JobRunSummaryRecord, UserProfileRecord } from "../persistence/repositories.js"
import {
  resolveEffectiveNotificationProfile,
  resolveNotificationGateDecision,
} from "../scheduler/notification-policy.js"
import { splitTelegramMessage } from "./telegram.js"

export type OutboundDeliveryRecord = {
  id: string
  chatId: number
  kind: "text" | "document" | "photo"
  content: string
  mediaPath: string | null
  mediaMimeType: string | null
  mediaFilename: string | null
  priority: "low" | "normal" | "high" | "critical"
  attemptCount: number
  createdAt: number
  errorMessage: string | null
}

export type OutboundMessagesDeliveryRepository = {
  listDue: (timestamp?: number) => OutboundDeliveryRecord[]
  markSent: (id: string, attemptCount: number, timestamp?: number) => void
  markRetry: (
    id: string,
    attemptCount: number,
    nextAttemptAt: number,
    errorMessage: string,
    timestamp?: number
  ) => void
  markFailed: (id: string, attemptCount: number, errorMessage: string, timestamp?: number) => void
}

export type OutboundMessageSender = {
  sendMessage: (chatId: number, text: string) => Promise<void>
  sendDocument: (
    chatId: number,
    input: { filePath: string; filename?: string; caption?: string }
  ) => Promise<void>
  sendPhoto: (chatId: number, input: { filePath: string; caption?: string }) => Promise<void>
}

export type OutboundRetryPolicy = {
  maxAttempts: number
  baseDelayMs: number
  maxDelayMs: number
}

export type OutboundQueueProcessorDependencies = {
  logger: Logger
  repository: OutboundMessagesDeliveryRepository
  sender: OutboundMessageSender
  retryPolicy: OutboundRetryPolicy
  userProfileRepository: {
    get: () => UserProfileRecord | null
    setLastDigestAt: (lastDigestAt: number, updatedAt?: number) => void
  }
  jobsRepository?: {
    listRecentRuns: (sinceTimestamp: number, limit?: number) => JobRunSummaryRecord[]
  }
}

const MAX_ERROR_MESSAGE_LENGTH = 1_000

/**
 * Uses a capped exponential retry schedule so temporary transport failures recover quickly
 * while permanent failures stop after a bounded number of delivery attempts.
 *
 * @param attemptCount Total attempts already consumed including the current failed attempt.
 * @param retryPolicy Retry tuning values resolved from runtime configuration.
 * @returns Backoff delay in milliseconds for the next retry.
 */
export const calculateRetryDelayMs = (
  attemptCount: number,
  retryPolicy: OutboundRetryPolicy
): number => {
  const exponent = Math.max(0, attemptCount - 1)
  const exponentialDelay = retryPolicy.baseDelayMs * 2 ** exponent
  return Math.min(exponentialDelay, retryPolicy.maxDelayMs)
}

const normalizeErrorMessage = (error: unknown): string => {
  const rawMessage = error instanceof Error ? error.message : String(error)
  return rawMessage.slice(0, MAX_ERROR_MESSAGE_LENGTH)
}

const SUPPRESSED_PREFIX = "suppressed_by_policy:"

const summarizeSuppressedRuns = (runs: JobRunSummaryRecord[]): string => {
  if (runs.length === 0) {
    return "No task activity happened while notifications were paused."
  }

  const successCount = runs.filter((run) => run.status === "success").length
  const failedCount = runs.filter((run) => run.status === "failed").length
  const skippedCount = runs.filter((run) => run.status === "skipped").length
  const topFailures = runs
    .filter((run) => run.status === "failed")
    .slice(0, 3)
    .map((run) => run.errorMessage ?? run.errorCode ?? "unknown error")

  const lines = [
    "Summary from your muted/quiet period:",
    `${runs.length} scheduled runs completed (${successCount} success, ${failedCount} failed, ${skippedCount} skipped).`,
    topFailures.length > 0
      ? `Main issues: ${topFailures.join(" | ")}.`
      : "No major failures detected.",
  ]

  return lines.join("\n")
}

/**
 * Creates a queue processor that drains due outbound records and persists retry/failure state,
 * so proactive delivery remains restart-safe and auditable.
 *
 * @param dependencies Delivery transport, persistence, logging, and retry policy.
 * @returns Processor API used by the Telegram worker scheduling loop.
 */
export const createOutboundQueueProcessor = (
  dependencies: OutboundQueueProcessorDependencies
): {
  drainDueMessages: (now?: number) => Promise<void>
} => {
  let draining = false

  const cleanupStagedMedia = async (message: OutboundDeliveryRecord): Promise<void> => {
    if (!message.mediaPath) {
      return
    }

    try {
      await rm(message.mediaPath, { force: true })
    } catch (error) {
      const err = error as Error
      dependencies.logger.warn(
        {
          messageId: message.id,
          mediaPath: message.mediaPath,
          error: err.message,
        },
        "Failed to clean up staged Telegram media file"
      )
    }
  }

  const deliverMessageChunks = async (message: OutboundDeliveryRecord): Promise<void> => {
    if (message.kind === "document") {
      if (!message.mediaPath) {
        throw new Error("Queued document is missing media path")
      }

      await dependencies.sender.sendDocument(message.chatId, {
        filePath: message.mediaPath,
        filename: message.mediaFilename ?? undefined,
        caption: message.content.length > 0 ? message.content : undefined,
      })
      return
    }

    if (message.kind === "photo") {
      if (!message.mediaPath) {
        throw new Error("Queued photo is missing media path")
      }

      await dependencies.sender.sendPhoto(message.chatId, {
        filePath: message.mediaPath,
        caption: message.content.length > 0 ? message.content : undefined,
      })
      return
    }

    const chunks = splitTelegramMessage(message.content)
    for (const chunk of chunks) {
      await dependencies.sender.sendMessage(message.chatId, chunk)
    }
  }

  const markDeliverySuccess = async (
    message: OutboundDeliveryRecord,
    attemptCount: number
  ): Promise<void> => {
    const deliveredAt = Date.now()
    dependencies.repository.markSent(message.id, attemptCount, deliveredAt)
    await cleanupStagedMedia(message)
    dependencies.logger.info(
      {
        messageId: message.id,
        chatId: message.chatId,
        attemptCount,
      },
      "Delivered queued Telegram message"
    )
  }

  const markDeliveryFailure = async (
    message: OutboundDeliveryRecord,
    attemptCount: number,
    error: unknown
  ): Promise<void> => {
    const failedAt = Date.now()
    const errorMessage = normalizeErrorMessage(error)

    if (attemptCount >= dependencies.retryPolicy.maxAttempts) {
      dependencies.repository.markFailed(message.id, attemptCount, errorMessage, failedAt)
      await cleanupStagedMedia(message)
      dependencies.logger.error(
        {
          messageId: message.id,
          chatId: message.chatId,
          attemptCount,
          maxAttempts: dependencies.retryPolicy.maxAttempts,
          error: errorMessage,
        },
        "Outbound Telegram message delivery permanently failed"
      )
      return
    }

    const retryDelayMs = calculateRetryDelayMs(attemptCount, dependencies.retryPolicy)
    const nextAttemptAt = failedAt + retryDelayMs
    dependencies.repository.markRetry(
      message.id,
      attemptCount,
      nextAttemptAt,
      errorMessage,
      failedAt
    )
    dependencies.logger.warn(
      {
        messageId: message.id,
        chatId: message.chatId,
        attemptCount,
        nextAttemptAt,
        retryDelayMs,
        error: errorMessage,
      },
      "Outbound Telegram message delivery failed; queued for retry"
    )
  }

  const processMessage = async (
    message: OutboundDeliveryRecord,
    evaluationTime: number
  ): Promise<void> => {
    const nextAttemptCount = message.attemptCount + 1

    const profile = resolveEffectiveNotificationProfile(dependencies.userProfileRepository.get())
    const urgency =
      message.priority === "high" || message.priority === "critical" ? "critical" : "normal"
    const gateDecision = resolveNotificationGateDecision(profile, urgency, evaluationTime)

    if (gateDecision.action === "hold") {
      const retryAt =
        gateDecision.releaseAt ?? evaluationTime + dependencies.retryPolicy.baseDelayMs
      dependencies.repository.markRetry(
        message.id,
        nextAttemptCount,
        retryAt,
        `${SUPPRESSED_PREFIX}${gateDecision.reason}`,
        evaluationTime
      )
      dependencies.logger.info(
        {
          messageId: message.id,
          chatId: message.chatId,
          retryAt,
          reason: gateDecision.reason,
        },
        "Outbound Telegram message suppressed by notification policy"
      )
      return
    }

    try {
      await deliverMessageChunks(message)
      await markDeliverySuccess(message, nextAttemptCount)
    } catch (error) {
      await markDeliveryFailure(message, nextAttemptCount, error)
    }
  }

  return {
    drainDueMessages: async (now = Date.now()): Promise<void> => {
      if (draining) {
        return
      }

      draining = true

      try {
        const dueMessages = dependencies.repository.listDue(now)

        const profile = resolveEffectiveNotificationProfile(
          dependencies.userProfileRepository.get()
        )
        const gateDecision = resolveNotificationGateDecision(profile, "normal", now)
        const releasedSuppressedMessages = dueMessages.filter((message) =>
          message.errorMessage?.startsWith(SUPPRESSED_PREFIX)
        )
        const digestHandledMessageIds = new Set<string>()

        if (
          releasedSuppressedMessages.length > 0 &&
          dependencies.jobsRepository &&
          gateDecision.action === "deliver_now"
        ) {
          const since = profile.lastDigestAt ?? now - 24 * 60 * 60 * 1000
          const runs = dependencies.jobsRepository
            .listRecentRuns(since, 200)
            .filter((run) => run.jobType !== "heartbeat")

          const groupedByChatId = new Map<number, OutboundDeliveryRecord[]>()
          for (const message of releasedSuppressedMessages) {
            const existing = groupedByChatId.get(message.chatId) ?? []
            existing.push(message)
            groupedByChatId.set(message.chatId, existing)
          }

          for (const [chatId, records] of groupedByChatId.entries()) {
            await dependencies.sender.sendMessage(chatId, summarizeSuppressedRuns(runs))
            for (const record of records) {
              dependencies.repository.markSent(record.id, record.attemptCount + 1, now)
              await cleanupStagedMedia(record)
              digestHandledMessageIds.add(record.id)
            }
          }

          dependencies.userProfileRepository.setLastDigestAt(now, now)
        }

        for (const message of dueMessages) {
          if (digestHandledMessageIds.has(message.id)) {
            continue
          }
          await processMessage(message, now)
        }
      } finally {
        draining = false
      }
    },
  }
}
