import type { Logger } from "pino"

import { splitTelegramMessage } from "./telegram.js"

export type OutboundDeliveryRecord = {
  id: string
  chatId: number
  content: string
  attemptCount: number
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

  const deliverMessageChunks = async (message: OutboundDeliveryRecord): Promise<void> => {
    const chunks = splitTelegramMessage(message.content)
    for (const chunk of chunks) {
      await dependencies.sender.sendMessage(message.chatId, chunk)
    }
  }

  const markDeliverySuccess = (message: OutboundDeliveryRecord, attemptCount: number): void => {
    const deliveredAt = Date.now()
    dependencies.repository.markSent(message.id, attemptCount, deliveredAt)
    dependencies.logger.info(
      {
        messageId: message.id,
        chatId: message.chatId,
        attemptCount,
      },
      "Delivered queued Telegram message"
    )
  }

  const markDeliveryFailure = (
    message: OutboundDeliveryRecord,
    attemptCount: number,
    error: unknown
  ): void => {
    const failedAt = Date.now()
    const errorMessage = normalizeErrorMessage(error)

    if (attemptCount >= dependencies.retryPolicy.maxAttempts) {
      dependencies.repository.markFailed(message.id, attemptCount, errorMessage, failedAt)
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

  const processMessage = async (message: OutboundDeliveryRecord): Promise<void> => {
    const nextAttemptCount = message.attemptCount + 1

    try {
      await deliverMessageChunks(message)
      markDeliverySuccess(message, nextAttemptCount)
    } catch (error) {
      markDeliveryFailure(message, nextAttemptCount, error)
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

        for (const message of dueMessages) {
          await processMessage(message)
        }
      } finally {
        draining = false
      }
    },
  }
}
