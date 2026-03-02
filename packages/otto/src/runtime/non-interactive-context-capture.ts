import { randomUUID } from "node:crypto"

import type { Logger } from "pino"

import type { InteractiveContextEventRecord } from "../persistence/repositories.js"
import { splitTelegramMessage } from "../telegram-worker/telegram.js"

type NonInteractiveContextCaptureLogger = Pick<Logger, "warn">

export type NonInteractiveContextCaptureService = {
  captureQueuedTextMessage: (input: {
    sourceSessionId: string | null
    sourceLane: string
    sourceKind: string
    sourceRef?: string | null
    content: string
    messageIds: string[]
    enqueueStatus: "enqueued" | "duplicate"
    timestamp?: number
  }) => void
  captureQueuedFileMessage: (input: {
    sourceSessionId: string | null
    sourceLane: string
    sourceKind: string
    sourceRef?: string | null
    caption: string
    messageIds: string[]
    enqueueStatus: "enqueued" | "duplicate"
    timestamp?: number
  }) => void
}

const normalizeSourceRef = (value: string | null | undefined): string | null => {
  if (typeof value !== "string") {
    return null
  }

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

const alignMessageBodies = (content: string, messageIds: string[]): string[] => {
  if (messageIds.length === 0) {
    return []
  }

  const chunks = splitTelegramMessage(content)
  if (chunks.length === messageIds.length) {
    return chunks
  }

  return []
}

export const createNonInteractiveContextCaptureService = (dependencies: {
  logger: NonInteractiveContextCaptureLogger
  interactiveContextEventsRepository: {
    insert: (record: InteractiveContextEventRecord) => void
  }
}): NonInteractiveContextCaptureService => {
  const capture = (input: {
    sourceSessionId: string | null
    sourceLane: string
    sourceKind: string
    sourceRef?: string | null
    enqueueStatus: "enqueued" | "duplicate"
    messageIds: string[]
    messageBodies: string[]
    timestamp?: number
  }): void => {
    if (!input.sourceSessionId || input.messageIds.length === 0) {
      return
    }

    const now = input.timestamp ?? Date.now()
    const sourceRef = normalizeSourceRef(input.sourceRef)

    for (const [index, outboundMessageId] of input.messageIds.entries()) {
      const content = input.messageBodies[index] ?? input.messageBodies[0] ?? ""
      if (content.trim().length === 0) {
        continue
      }

      try {
        dependencies.interactiveContextEventsRepository.insert({
          id: randomUUID(),
          sourceSessionId: input.sourceSessionId,
          outboundMessageId,
          sourceLane: input.sourceLane,
          sourceKind: input.sourceKind,
          sourceRef,
          content,
          deliveryStatus: "queued",
          deliveryStatusDetail: input.enqueueStatus,
          errorMessage: null,
          createdAt: now,
          updatedAt: now,
        })
      } catch (error) {
        const err = error as Error
        dependencies.logger.warn(
          {
            sourceSessionId: input.sourceSessionId,
            outboundMessageId,
            sourceLane: input.sourceLane,
            sourceKind: input.sourceKind,
            sourceRef,
            error: err.message,
          },
          "Failed to capture non-interactive context event"
        )
      }
    }
  }

  return {
    captureQueuedTextMessage: (input): void => {
      const messageBodies = alignMessageBodies(input.content, input.messageIds)
      if (input.messageIds.length > 0 && messageBodies.length === 0) {
        dependencies.logger.warn(
          {
            sourceSessionId: input.sourceSessionId,
            sourceLane: input.sourceLane,
            sourceKind: input.sourceKind,
            sourceRef: normalizeSourceRef(input.sourceRef),
            messageIdCount: input.messageIds.length,
          },
          "Skipping non-interactive text context capture because queued message ids do not align with chunked content"
        )
        return
      }

      capture({
        sourceSessionId: input.sourceSessionId,
        sourceLane: input.sourceLane,
        sourceKind: input.sourceKind,
        sourceRef: input.sourceRef,
        enqueueStatus: input.enqueueStatus,
        messageIds: input.messageIds,
        messageBodies,
        timestamp: input.timestamp,
      })
    },
    captureQueuedFileMessage: (input): void => {
      capture({
        sourceSessionId: input.sourceSessionId,
        sourceLane: input.sourceLane,
        sourceKind: input.sourceKind,
        sourceRef: input.sourceRef,
        enqueueStatus: input.enqueueStatus,
        messageIds: input.messageIds,
        messageBodies: input.messageIds.map(() => input.caption),
        timestamp: input.timestamp,
      })
    },
  }
}
