import { randomUUID } from "node:crypto"

import { z } from "zod"

import type { MessagePriority, OutboundMessageKind } from "../persistence/repositories.js"
import { splitTelegramMessage } from "./telegram.js"

export const queueTelegramMessageInputSchema = z.object({
  chatId: z.number().int().positive(),
  content: z.string().trim().min(1),
  dedupeKey: z.string().trim().min(1).max(512).optional(),
  priority: z.enum(["low", "normal", "high", "critical"]).optional(),
})

export type QueueTelegramMessageInput = z.infer<typeof queueTelegramMessageInputSchema>

export type QueueTelegramMessageResult = {
  status: "enqueued" | "duplicate"
  queuedCount: number
  duplicateCount: number
  messageIds: string[]
  dedupeKey: string | null
}

export const queueTelegramFileInputSchema = z.object({
  chatId: z.number().int().positive(),
  kind: z.enum(["document", "photo"]),
  filePath: z.string().trim().min(1),
  mimeType: z.string().trim().min(1),
  fileName: z.string().trim().min(1).optional(),
  caption: z.string().trim().max(4000).optional(),
  dedupeKey: z.string().trim().min(1).max(512).optional(),
  priority: z.enum(["low", "normal", "high", "critical"]).optional(),
})

export type QueueTelegramFileInput = z.infer<typeof queueTelegramFileInputSchema>

export type QueueTelegramFileResult = {
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
    kind: OutboundMessageKind
    content: string
    mediaPath: string | null
    mediaMimeType: string | null
    mediaFilename: string | null
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
      kind: "text",
      content: chunk,
      mediaPath: null,
      mediaMimeType: null,
      mediaFilename: null,
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

/**
 * Queues a Telegram document/photo payload behind the same durable queue and dedupe behavior
 * as text, so media delivery remains retry-safe and observable.
 *
 * @param input Raw tool/API payload for queueing outbound Telegram media.
 * @param outboundMessagesRepository Repository that persists outbound queue rows.
 * @param timestamp Fixed timestamp override used by tests and deterministic callers.
 * @returns Idempotent enqueue result summary for audit logs and callers.
 */
export const enqueueTelegramFile = (
  input: unknown,
  outboundMessagesRepository: OutboundMessageEnqueueRepository,
  timestamp = Date.now()
): QueueTelegramFileResult => {
  const parsedInput = queueTelegramFileInputSchema.parse(input)
  const dedupeKey = parsedInput.dedupeKey ?? null
  const messageId = randomUUID()

  const result = outboundMessagesRepository.enqueueOrIgnoreDedupe({
    id: messageId,
    dedupeKey,
    chatId: parsedInput.chatId,
    kind: parsedInput.kind,
    content: parsedInput.caption ?? "",
    mediaPath: parsedInput.filePath,
    mediaMimeType: parsedInput.mimeType,
    mediaFilename: parsedInput.fileName ?? null,
    priority: parsedInput.priority ?? "normal",
    status: "queued",
    attemptCount: 0,
    nextAttemptAt: timestamp,
    sentAt: null,
    failedAt: null,
    errorMessage: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  })

  if (result === "duplicate") {
    return {
      status: "duplicate",
      queuedCount: 0,
      duplicateCount: 1,
      messageIds: [],
      dedupeKey,
    }
  }

  return {
    status: "enqueued",
    queuedCount: 1,
    duplicateCount: 0,
    messageIds: [messageId],
    dedupeKey,
  }
}
