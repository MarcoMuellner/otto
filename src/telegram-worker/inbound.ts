import { randomUUID } from "node:crypto"

import type { Logger } from "pino"

import { normalizeAssistantText, splitTelegramMessage } from "./telegram.js"
import type { OpencodeSessionGateway } from "./opencode.js"

export type TelegramInboundMessage = {
  sourceMessageId: string
  chatId: number
  userId: number
  text: string
}

export type TelegramSender = {
  sendMessage: (chatId: number, text: string) => Promise<void>
  sendChatAction?: (chatId: number, action: "typing") => Promise<void>
}

export type SessionBindingsRepository = {
  getByBindingKey: (bindingKey: string) => { sessionId: string } | null
  upsert: (bindingKey: string, sessionId: string, updatedAt?: number) => void
}

export type InboundMessagesRepository = {
  insert: (record: {
    id: string
    sourceMessageId: string
    chatId: number
    userId: number
    content: string
    receivedAt: number
    sessionId: string
    createdAt: number
  }) => void
}

export type OutboundMessagesRepository = {
  enqueue: (record: {
    id: string
    dedupeKey: string | null
    chatId: number
    content: string
    priority: "low" | "normal" | "high"
    status: "queued" | "sent" | "failed" | "cancelled"
    attemptCount: number
    nextAttemptAt: number | null
    sentAt: number | null
    failedAt: number | null
    errorMessage: string | null
    createdAt: number
    updatedAt: number
  }) => void
}

export type InboundBridgeDependencies = {
  logger: Logger
  sender: TelegramSender
  sessionGateway: OpencodeSessionGateway
  sessionBindingsRepository: SessionBindingsRepository
  inboundMessagesRepository: InboundMessagesRepository
  outboundMessagesRepository: OutboundMessagesRepository
  promptTimeoutMs: number
  bindingPrefix?: string
}

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  return await new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`OpenCode prompt timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    promise
      .then((result) => {
        clearTimeout(timeoutId)
        resolve(result)
      })
      .catch((error) => {
        clearTimeout(timeoutId)
        reject(error)
      })
  })
}

const isUniqueConstraintViolation = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false
  }

  return error.message.includes("UNIQUE") || error.message.includes("constraint")
}

const TYPING_ACTION_INTERVAL_MS = 4_000

const startTypingHeartbeat = (
  sender: TelegramSender,
  logger: Logger,
  chatId: number
): (() => void) => {
  if (!sender.sendChatAction) {
    return () => {}
  }

  let active = true

  const emitTyping = async (): Promise<void> => {
    if (!active) {
      return
    }

    try {
      await sender.sendChatAction?.(chatId, "typing")
    } catch (error) {
      const err = error as Error
      logger.debug({ chatId, error: err.message }, "Failed to send Telegram typing action")
    }
  }

  void emitTyping()

  const timer = setInterval(() => {
    void emitTyping()
  }, TYPING_ACTION_INTERVAL_MS)

  return () => {
    active = false
    clearInterval(timer)
  }
}

/**
 * Creates the inbound Telegram-to-OpenCode bridge so text messages can reuse stable sessions
 * and return replies while persisting orchestration records.
 *
 * @param dependencies Transport, persistence, and OpenCode gateway dependencies.
 * @returns Message handler used by the Telegram worker runtime.
 */
export const createInboundBridge = (dependencies: InboundBridgeDependencies) => {
  const bindingPrefix = dependencies.bindingPrefix ?? "telegram:chat"

  return {
    handleTextMessage: async (message: TelegramInboundMessage): Promise<void> => {
      const now = Date.now()
      const bindingKey = `${bindingPrefix}:${message.chatId}:assistant`

      const existingBinding = dependencies.sessionBindingsRepository.getByBindingKey(bindingKey)
      const resolvedSessionId = await dependencies.sessionGateway.ensureSession(
        existingBinding?.sessionId ?? null
      )

      if (existingBinding?.sessionId !== resolvedSessionId) {
        dependencies.sessionBindingsRepository.upsert(bindingKey, resolvedSessionId, now)
      }

      try {
        dependencies.inboundMessagesRepository.insert({
          id: randomUUID(),
          sourceMessageId: message.sourceMessageId,
          chatId: message.chatId,
          userId: message.userId,
          content: message.text,
          receivedAt: now,
          sessionId: resolvedSessionId,
          createdAt: now,
        })
      } catch (error) {
        if (isUniqueConstraintViolation(error)) {
          dependencies.logger.info(
            { sourceMessageId: message.sourceMessageId },
            "Skipping duplicate inbound Telegram message"
          )
          return
        }

        throw error
      }

      let assistantText = ""
      const stopTypingHeartbeat = startTypingHeartbeat(
        dependencies.sender,
        dependencies.logger,
        message.chatId
      )

      try {
        assistantText = await withTimeout(
          dependencies.sessionGateway.promptSession(resolvedSessionId, message.text),
          dependencies.promptTimeoutMs
        )
      } catch (error) {
        const err = error as Error
        dependencies.logger.error(
          { error: err.message },
          "Failed to process Telegram inbound prompt"
        )

        const fallbackMessage = "I could not complete that right now. Please try again in a moment."
        await dependencies.sender.sendMessage(message.chatId, fallbackMessage)
        return
      } finally {
        stopTypingHeartbeat()
      }

      const reply = normalizeAssistantText(assistantText)
      const chunks = splitTelegramMessage(reply)

      for (const chunk of chunks) {
        await dependencies.sender.sendMessage(message.chatId, chunk)

        const sentAt = Date.now()
        dependencies.outboundMessagesRepository.enqueue({
          id: randomUUID(),
          dedupeKey: null,
          chatId: message.chatId,
          content: chunk,
          priority: "normal",
          status: "sent",
          attemptCount: 1,
          nextAttemptAt: null,
          sentAt,
          failedAt: null,
          errorMessage: null,
          createdAt: sentAt,
          updatedAt: sentAt,
        })
      }
    },
  }
}
