import { randomUUID } from "node:crypto"

import { z } from "zod"

import type { MessagePriority } from "../persistence/repositories.js"
import { splitTelegramMessage } from "./telegram.js"

export const queueTelegramMessageInputSchema = z.object({
  chatId: z.number().int().positive(),
  content: z.string().trim().min(1),
  dedupeKey: z.string().trim().min(1).max(512).optional(),
  priority: z.enum(["low", "normal", "high"]).optional(),
})

export type QueueTelegramMessageInput = z.infer<typeof queueTelegramMessageInputSchema>

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
 * Converts a single queue request into durable outbound records with deterministic dedupe keys,
 * so retries and idempotent enqueue behavior stay consistent across all trigger paths.
 *
 * @param input Raw tool/API payload for queueing outbound Telegram content.
 * @param outboundMessagesRepository Repository that persists outbound queue rows.
 * @param timestamp Fixed timestamp override used by tests and deterministic callers.
 * @returns Idempotent enqueue result summary for audit logs and callers.
 */
export const enqueueTelegramMessage = (
  input: unknown,
  outboundMessagesRepository: OutboundMessageEnqueueRepository,
  timestamp = Date.now()
): QueueTelegramMessageResult => {
  const parsedInput = queueTelegramMessageInputSchema.parse(input)
  const contentChunks = splitTelegramMessage(parsedInput.content)
  const priority: MessagePriority = parsedInput.priority ?? "normal"
  const dedupeKey = parsedInput.dedupeKey ?? null
  const messageIds: string[] = []
  let queuedCount = 0
  let duplicateCount = 0

  contentChunks.forEach((chunk, index) => {
    const chunkDedupeKey = buildChunkDedupeKey(dedupeKey, index, contentChunks.length)
    const id = randomUUID()

    const result = outboundMessagesRepository.enqueueOrIgnoreDedupe({
      id,
      dedupeKey: chunkDedupeKey,
      chatId: parsedInput.chatId,
      content: chunk,
      priority,
      status: "queued",
      attemptCount: 0,
      nextAttemptAt: timestamp,
      sentAt: null,
      failedAt: null,
      errorMessage: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    })

    if (result === "enqueued") {
      queuedCount += 1
      messageIds.push(id)
      return
    }

    duplicateCount += 1
  })

  return {
    status: queuedCount > 0 ? "enqueued" : "duplicate",
    queuedCount,
    duplicateCount,
    messageIds,
    dedupeKey,
  }
}
