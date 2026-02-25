import { randomUUID } from "node:crypto"

import type { Logger } from "pino"

import { normalizeAssistantText, splitTelegramMessage } from "./telegram.js"
import type { OpencodePromptPart, OpencodeSessionGateway } from "./opencode.js"

export type TelegramInboundMessage = {
  sourceMessageId: string
  chatId: number
  userId: number
  text: string
}

export type TelegramInboundMediaMessage = {
  sourceMessageId: string
  chatId: number
  userId: number
  storageText: string
  parts: OpencodePromptPart[]
}

export type InboundHandleResult =
  | { outcome: "processed" }
  | { outcome: "duplicate" }
  | { outcome: "failed"; errorMessage: string }

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
    kind: "text" | "document" | "photo"
    mediaPath: string | null
    mediaMimeType: string | null
    mediaFilename: string | null
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

const DEFAULT_FALLBACK_MESSAGE =
  "I could not complete that right now. Please try again in a moment."
const TIMEOUT_FALLBACK_MESSAGE =
  "That request is taking longer than expected. Please try again in a moment."

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

const isPromptTimeoutError = (errorMessage: string): boolean => {
  return errorMessage.includes("OpenCode prompt timed out after")
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

  const resolveSessionId = async (chatId: number, now: number): Promise<string> => {
    const bindingKey = `${bindingPrefix}:${chatId}:assistant`
    const existingBinding = dependencies.sessionBindingsRepository.getByBindingKey(bindingKey)
    const resolvedSessionId = await dependencies.sessionGateway.ensureSession(
      existingBinding?.sessionId ?? null
    )

    if (existingBinding?.sessionId !== resolvedSessionId) {
      dependencies.sessionBindingsRepository.upsert(bindingKey, resolvedSessionId, now)
    }

    return resolvedSessionId
  }

  const sendAssistantReply = async (
    chatId: number,
    assistantText: string,
    now: number
  ): Promise<void> => {
    const reply = normalizeAssistantText(assistantText)
    const chunks = splitTelegramMessage(reply)

    for (const chunk of chunks) {
      await dependencies.sender.sendMessage(chatId, chunk)

      dependencies.outboundMessagesRepository.enqueue({
        id: randomUUID(),
        dedupeKey: null,
        chatId,
        kind: "text",
        content: chunk,
        mediaPath: null,
        mediaMimeType: null,
        mediaFilename: null,
        priority: "normal",
        status: "sent",
        attemptCount: 1,
        nextAttemptAt: null,
        sentAt: now,
        failedAt: null,
        errorMessage: null,
        createdAt: now,
        updatedAt: now,
      })
    }
  }

  const handlePrompt = async (input: {
    sourceMessageId: string
    chatId: number
    userId: number
    storageText: string
    parts: OpencodePromptPart[]
  }): Promise<InboundHandleResult> => {
    const now = Date.now()
    const resolvedSessionId = await resolveSessionId(input.chatId, now)

    try {
      dependencies.inboundMessagesRepository.insert({
        id: randomUUID(),
        sourceMessageId: input.sourceMessageId,
        chatId: input.chatId,
        userId: input.userId,
        content: input.storageText,
        receivedAt: now,
        sessionId: resolvedSessionId,
        createdAt: now,
      })
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        dependencies.logger.info(
          { sourceMessageId: input.sourceMessageId },
          "Skipping duplicate inbound Telegram message"
        )
        return { outcome: "duplicate" }
      }

      throw error
    }

    let assistantText = ""
    const stopTypingHeartbeat = startTypingHeartbeat(
      dependencies.sender,
      dependencies.logger,
      input.chatId
    )

    const promptStartedAt = Date.now()

    try {
      assistantText = await withTimeout(
        dependencies.sessionGateway.promptSessionParts(resolvedSessionId, input.parts, {
          modelContext: {
            flow: "interactiveAssistant",
          },
        }),
        dependencies.promptTimeoutMs
      )
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const timedOut = isPromptTimeoutError(errorMessage)

      dependencies.logger.error(
        {
          error: errorMessage,
          chatId: input.chatId,
          sourceMessageId: input.sourceMessageId,
          timedOut,
          elapsedMs: Date.now() - promptStartedAt,
          promptTimeoutMs: dependencies.promptTimeoutMs,
        },
        "Failed to process Telegram inbound prompt"
      )

      const fallbackMessage = timedOut ? TIMEOUT_FALLBACK_MESSAGE : DEFAULT_FALLBACK_MESSAGE
      await dependencies.sender.sendMessage(input.chatId, fallbackMessage)
      return {
        outcome: "failed",
        errorMessage,
      }
    } finally {
      stopTypingHeartbeat()
    }

    await sendAssistantReply(input.chatId, assistantText, Date.now())
    return { outcome: "processed" }
  }

  return {
    handleTextMessage: async (message: TelegramInboundMessage): Promise<InboundHandleResult> => {
      return await handlePrompt({
        sourceMessageId: message.sourceMessageId,
        chatId: message.chatId,
        userId: message.userId,
        storageText: message.text,
        parts: [{ type: "text", text: message.text }],
      })
    },
    handleMediaMessage: async (
      message: TelegramInboundMediaMessage
    ): Promise<InboundHandleResult> => {
      return await handlePrompt({
        sourceMessageId: message.sourceMessageId,
        chatId: message.chatId,
        userId: message.userId,
        storageText: message.storageText,
        parts: message.parts,
      })
    },
  }
}
