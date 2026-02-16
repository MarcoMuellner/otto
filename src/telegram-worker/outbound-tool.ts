import { randomUUID } from "node:crypto"

import type { Logger } from "pino"
import { z } from "zod"

import type { MessagePriority } from "../persistence/repositories.js"
import { splitTelegramMessage } from "./telegram.js"

const queueTelegramMessageSchema = z.object({
  chatId: z.number().int().positive(),
  content: z.string().trim().min(1),
  dedupeKey: z.string().trim().min(1).max(512).optional(),
  priority: z.enum(["low", "normal", "high"]).optional(),
})

export type QueueTelegramMessageInput = z.infer<typeof queueTelegramMessageSchema>

export type QueueTelegramMessageResult = {
  status: "enqueued" | "duplicate"
  queuedCount: number
  duplicateCount: number
  messageIds: string[]
  dedupeKey: string | null
}

export type OutboundMessageEnqueueRepository = {
  enqueueOrIgnoreDedupe: (record: {
    id: string
    dedupeKey: string | null
    chatId: number
    content: string
    priority: MessagePriority
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

export type QueueTelegramMessageToolDependencies = {
  logger: Logger
  outboundMessagesRepository: OutboundMessageEnqueueRepository
}

const buildChunkDedupeKey = (
  dedupeKey: string | null,
  index: number,
  total: number
): string | null => {
  if (!dedupeKey) {
    return null
  }

  return `${dedupeKey}:${index + 1}/${total}`
}

/**
 * Produces a deterministic enqueue tool contract so proactive model actions map directly to
 * durable queue writes instead of fragile free-form text parsing.
 *
 * @param dependencies Logger and outbound queue persistence dependencies.
 * @returns Tool metadata plus an execute function that validates and enqueues payloads.
 */
export const createQueueTelegramMessageTool = (
  dependencies: QueueTelegramMessageToolDependencies
): {
  name: "queue_telegram_message"
  description: string
  execute: (input: unknown) => QueueTelegramMessageResult
} => {
  return {
    name: "queue_telegram_message",
    description:
      "Queue a Telegram outbound message with idempotent dedupe behavior and retry-capable delivery state.",
    execute: (input: unknown): QueueTelegramMessageResult => {
      const parsedInput = queueTelegramMessageSchema.parse(input)
      const now = Date.now()
      const contentChunks = splitTelegramMessage(parsedInput.content)
      const priority: MessagePriority = parsedInput.priority ?? "normal"
      const dedupeKey = parsedInput.dedupeKey ?? null
      const messageIds: string[] = []
      let queuedCount = 0
      let duplicateCount = 0

      contentChunks.forEach((chunk, index) => {
        const chunkDedupeKey = buildChunkDedupeKey(dedupeKey, index, contentChunks.length)
        const id = randomUUID()

        const result = dependencies.outboundMessagesRepository.enqueueOrIgnoreDedupe({
          id,
          dedupeKey: chunkDedupeKey,
          chatId: parsedInput.chatId,
          content: chunk,
          priority,
          status: "queued",
          attemptCount: 0,
          nextAttemptAt: now,
          sentAt: null,
          failedAt: null,
          errorMessage: null,
          createdAt: now,
          updatedAt: now,
        })

        if (result === "enqueued") {
          queuedCount += 1
          messageIds.push(id)
        } else {
          duplicateCount += 1
        }
      })

      const status = queuedCount > 0 ? "enqueued" : "duplicate"

      dependencies.logger.info(
        {
          tool: "queue_telegram_message",
          chatId: parsedInput.chatId,
          dedupeKey,
          status,
          queuedCount,
          duplicateCount,
        },
        "Processed queue_telegram_message request"
      )

      return {
        status,
        queuedCount,
        duplicateCount,
        messageIds,
        dedupeKey,
      }
    },
  }
}
