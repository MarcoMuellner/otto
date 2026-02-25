import type { Logger } from "pino"
import { Input, Telegraf } from "telegraf"
import { randomUUID } from "node:crypto"

import { openPersistenceDatabase } from "../persistence/index.js"
import { createInboundMessagesRepository } from "../persistence/repositories.js"
import { createJobsRepository } from "../persistence/repositories.js"
import { createOutboundMessagesRepository } from "../persistence/repositories.js"
import { createSessionBindingsRepository } from "../persistence/repositories.js"
import { createUserProfileRepository } from "../persistence/repositories.js"
import { createMediaInboundMessagesRepository } from "../persistence/repositories.js"
import { createVoiceInboundMessagesRepository } from "../persistence/repositories.js"
import type { TelegramWorkerConfig } from "./config.js"
import { createInboundBridge } from "./inbound.js"
import type { OpencodeSessionGateway } from "./opencode.js"
import { createOutboundQueueProcessor } from "./outbound-queue.js"
import { createTranscriptionGateway, type TranscriptionGateway } from "./transcription.js"
import { isProfileOnboardingComplete } from "../scheduler/notification-policy.js"
import {
  buildMediaDataUrl,
  downloadInboundMediaFile,
  validateInboundMediaPayload,
  type TelegramInboundMediaMessage as TelegramInboundMediaPayload,
  type TelegramMediaDownloadDescriptor,
} from "./media-intake.js"
import {
  downloadVoiceFile,
  validateVoicePayload,
  type TelegramVoiceMessage,
} from "./voice-intake.js"
import {
  evaluateTelegramAccess,
  extractTelegramAccessContext,
  logDeniedTelegramAccess,
} from "./security.js"
import type { DatabaseSync } from "node:sqlite"

export type TelegramWorkerHandle = {
  stop: () => Promise<void>
}

export type TelegramInboundUpdate = {
  sourceMessageId: string
  chatId: number
  userId: number
  text: string
  update: unknown
}

export type TelegramInboundVoiceUpdate = {
  sourceMessageId: string
  chatId: number
  userId: number
  voice: TelegramVoiceMessage
  update: unknown
}

export type TelegramInboundMediaUpdate = {
  sourceMessageId: string
  chatId: number
  userId: number
  media: TelegramInboundMediaPayload
  update: unknown
}

export type TelegramUnsupportedMediaUpdate = {
  sourceMessageId: string
  chatId: number
  userId: number
  mediaType: "video_note" | "video" | "document" | "photo" | "sticker" | "animation" | "unknown"
  update: unknown
}

export type TelegramVoiceDownload = {
  url: string
  fileSizeBytes: number | null
  fileName: string | null
}

export type TelegramBotRuntime = {
  onTextMessage: (handler: (update: TelegramInboundUpdate) => Promise<void>) => void
  onVoiceMessage: (handler: (update: TelegramInboundVoiceUpdate) => Promise<void>) => void
  onMediaMessage: (handler: (update: TelegramInboundMediaUpdate) => Promise<void>) => void
  onUnsupportedMediaMessage: (
    handler: (update: TelegramUnsupportedMediaUpdate) => Promise<void>
  ) => void
  sendMessage: (chatId: number, text: string) => Promise<void>
  sendDocument: (
    chatId: number,
    input: { filePath: string; filename?: string; caption?: string }
  ) => Promise<void>
  sendPhoto: (chatId: number, input: { filePath: string; caption?: string }) => Promise<void>
  sendChatAction?: (chatId: number, action: "typing") => Promise<void>
  resolveVoiceDownload: (fileId: string) => Promise<TelegramVoiceDownload>
  resolveFileDownload: (fileId: string) => Promise<TelegramMediaDownloadDescriptor>
  launch: () => Promise<void>
  stop: () => Promise<void>
}

export type TelegramWorkerDependencies = {
  createBotRuntime?: (botToken: string) => TelegramBotRuntime
  openDatabase?: () => DatabaseSync
  createSessionGateway?: (
    baseUrl: string
  ) => Promise<OpencodeSessionGateway> | OpencodeSessionGateway
  createTranscriptionGateway?: (
    config: TelegramWorkerConfig["transcription"]
  ) => Promise<TranscriptionGateway> | TranscriptionGateway
}

const TELEGRAM_LAUNCH_RETRY_DELAY_MS = 30_000
const TELEGRAM_MEDIA_MAX_BYTES = 15 * 1024 * 1024
const TELEGRAM_MEDIA_DOWNLOAD_TIMEOUT_MS = 25_000
const TELEGRAM_MEDIA_GROUP_FLUSH_DELAY_MS = 600
const ALLOWED_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/json",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]
const ALLOWED_PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"]

const classifyUnsupportedMediaType = (
  message: object
): TelegramUnsupportedMediaUpdate["mediaType"] => {
  if ("video_note" in message) {
    return "video_note"
  }

  if ("video" in message) {
    return "video"
  }

  if ("document" in message) {
    return "document"
  }

  if ("photo" in message) {
    return "photo"
  }

  if ("sticker" in message) {
    return "sticker"
  }

  if ("animation" in message) {
    return "animation"
  }

  return "unknown"
}

const resolveMediaGroupId = (message: object): string | null => {
  const value = (message as { media_group_id?: unknown }).media_group_id
  if (typeof value === "string" && value.trim().length > 0) {
    return value
  }

  return null
}

const createTelegrafRuntime = (botToken: string): TelegramBotRuntime => {
  const bot = new Telegraf(botToken)

  const textHandlers: Array<(update: TelegramInboundUpdate) => Promise<void>> = []
  const voiceHandlers: Array<(update: TelegramInboundVoiceUpdate) => Promise<void>> = []
  const mediaHandlers: Array<(update: TelegramInboundMediaUpdate) => Promise<void>> = []
  const unsupportedMediaHandlers: Array<(update: TelegramUnsupportedMediaUpdate) => Promise<void>> =
    []

  bot.on("message", async (context) => {
    const message = context.message
    if (!message) {
      return
    }

    const sourceMessageId = String(message.message_id)
    const chatId = context.chat.id
    const userId = context.from?.id ?? 0

    if ("text" in message) {
      for (const handler of textHandlers) {
        await handler({
          sourceMessageId,
          chatId,
          userId,
          text: message.text,
          update: context.update,
        })
      }
      return
    }

    let voicePayload: TelegramVoiceMessage | null = null

    if ("voice" in message) {
      const voice = message.voice
      voicePayload = {
        inputType: "voice",
        fileId: voice.file_id,
        fileUniqueId: voice.file_unique_id,
        durationSec: voice.duration,
        mimeType: voice.mime_type ?? "audio/ogg",
        fileSizeBytes: voice.file_size ?? null,
      }
    } else if ("audio" in message) {
      const audio = message.audio
      voicePayload = {
        inputType: "audio",
        fileId: audio.file_id,
        fileUniqueId: audio.file_unique_id,
        durationSec: audio.duration,
        mimeType: audio.mime_type ?? "audio/mpeg",
        fileSizeBytes: audio.file_size ?? null,
      }
    }

    if (voicePayload) {
      for (const handler of voiceHandlers) {
        await handler({
          sourceMessageId,
          chatId,
          userId,
          voice: voicePayload,
          update: context.update,
        })
      }
      return
    }

    if ("document" in message) {
      const document = message.document
      const mediaPayload: TelegramInboundMediaPayload = {
        mediaType: "document",
        fileId: document.file_id,
        fileUniqueId: document.file_unique_id,
        mediaGroupId: resolveMediaGroupId(message),
        mimeType: document.mime_type ?? "application/octet-stream",
        fileSizeBytes: document.file_size ?? null,
        fileName: document.file_name ?? null,
        caption: message.caption ?? null,
      }

      for (const handler of mediaHandlers) {
        await handler({
          sourceMessageId,
          chatId,
          userId,
          media: mediaPayload,
          update: context.update,
        })
      }
      return
    }

    if ("photo" in message && Array.isArray(message.photo) && message.photo.length > 0) {
      const photo = message.photo[message.photo.length - 1]
      const mediaPayload: TelegramInboundMediaPayload = {
        mediaType: "photo",
        fileId: photo.file_id,
        fileUniqueId: photo.file_unique_id,
        mediaGroupId: resolveMediaGroupId(message),
        mimeType: "image/jpeg",
        fileSizeBytes: photo.file_size ?? null,
        fileName: null,
        caption: message.caption ?? null,
      }

      for (const handler of mediaHandlers) {
        await handler({
          sourceMessageId,
          chatId,
          userId,
          media: mediaPayload,
          update: context.update,
        })
      }
      return
    }

    const mediaType = classifyUnsupportedMediaType(message)

    for (const handler of unsupportedMediaHandlers) {
      await handler({
        sourceMessageId,
        chatId,
        userId,
        mediaType,
        update: context.update,
      })
    }
  })

  return {
    onTextMessage: (handler) => {
      textHandlers.push(handler)
    },
    onVoiceMessage: (handler) => {
      voiceHandlers.push(handler)
    },
    onMediaMessage: (handler) => {
      mediaHandlers.push(handler)
    },
    onUnsupportedMediaMessage: (handler) => {
      unsupportedMediaHandlers.push(handler)
    },
    sendMessage: async (chatId, text) => {
      await bot.telegram.sendMessage(chatId, text)
    },
    sendDocument: async (chatId, input) => {
      await bot.telegram.sendDocument(chatId, Input.fromLocalFile(input.filePath, input.filename), {
        caption: input.caption,
      })
    },
    sendPhoto: async (chatId, input) => {
      await bot.telegram.sendPhoto(chatId, Input.fromLocalFile(input.filePath), {
        caption: input.caption,
      })
    },
    sendChatAction: async (chatId, action) => {
      await bot.telegram.sendChatAction(chatId, action)
    },
    resolveVoiceDownload: async (fileId) => {
      const file = await bot.telegram.getFile(fileId)
      if (!file.file_path) {
        throw new Error("Telegram file path is missing for voice message")
      }

      const filePath = file.file_path
      const fileName = filePath.split("/").at(-1) ?? null

      return {
        url: `https://api.telegram.org/file/bot${botToken}/${filePath}`,
        fileSizeBytes: file.file_size ?? null,
        fileName,
      }
    },
    resolveFileDownload: async (fileId) => {
      const file = await bot.telegram.getFile(fileId)
      if (!file.file_path) {
        throw new Error("Telegram file path is missing")
      }

      const filePath = file.file_path
      const fileName = filePath.split("/").at(-1) ?? null

      return {
        url: `https://api.telegram.org/file/bot${botToken}/${filePath}`,
        fileSizeBytes: file.file_size ?? null,
        fileName,
      }
    },
    launch: async () => {
      await bot.launch()
    },
    stop: async () => {
      await bot.stop()
    },
  }
}

/**
 * Starts Telegram inbound bridge handling so authorized direct messages can be forwarded
 * into stable OpenCode sessions with persisted workflow records.
 *
 * @param logger Component-scoped logger for worker telemetry.
 * @param config Resolved worker configuration.
 * @returns Handle used by runtime orchestrators to stop worker resources.
 */
export const startTelegramWorker = async (
  logger: Logger,
  config: TelegramWorkerConfig,
  dependencies: TelegramWorkerDependencies = {}
): Promise<TelegramWorkerHandle> => {
  if (!config.enabled) {
    logger.info("Telegram worker disabled by configuration")
    return {
      stop: async () => {
        logger.info("Telegram worker stop requested while disabled")
      },
    }
  }

  const database = dependencies.openDatabase?.() ?? openPersistenceDatabase()
  const sessionBindingsRepository = createSessionBindingsRepository(database)
  const inboundMessagesRepository = createInboundMessagesRepository(database)
  const jobsRepository = createJobsRepository(database)
  const outboundMessagesRepository = createOutboundMessagesRepository(database)
  const voiceInboundMessagesRepository = createVoiceInboundMessagesRepository(database)
  const mediaInboundMessagesRepository = createMediaInboundMessagesRepository(database)
  const userProfileRepository = createUserProfileRepository(database)
  const sessionGatewayFactory =
    dependencies.createSessionGateway ??
    (async (baseUrl: string): Promise<OpencodeSessionGateway> => {
      const module = await import("./opencode.js")
      return module.createOpencodeSessionGateway(baseUrl, logger)
    })

  const sessionGateway = await sessionGatewayFactory(config.opencodeBaseUrl)
  const transcriptionGatewayFactory =
    dependencies.createTranscriptionGateway ?? createTranscriptionGateway
  let transcriptionGateway: TranscriptionGateway | null = null

  if (config.voice.enabled) {
    try {
      transcriptionGateway = await transcriptionGatewayFactory(config.transcription)
    } catch (error) {
      const err = error as Error
      logger.warn(
        { error: err.message },
        "Voice transcription gateway is unavailable; voice messages will receive fallback notice"
      )
      transcriptionGateway = null
    }
  }
  const bot =
    dependencies.createBotRuntime?.(config.botToken) ?? createTelegrafRuntime(config.botToken)
  const inFlightChats = new Set<number>()
  const onboardingPromptedChats = new Set<number>()
  const pendingMediaGroupBatches = new Map<
    string,
    {
      chatId: number
      userId: number
      mediaGroupId: string
      updates: TelegramInboundMediaUpdate[]
      timer: NodeJS.Timeout | null
    }
  >()
  let stopRequested = false
  let launchInFlight = false
  let launchRetryTimer: NodeJS.Timeout | null = null

  const bridge = createInboundBridge({
    logger,
    sender: {
      sendMessage: bot.sendMessage,
      sendChatAction: bot.sendChatAction,
    },
    sessionGateway,
    sessionBindingsRepository,
    inboundMessagesRepository,
    outboundMessagesRepository,
    promptTimeoutMs: config.promptTimeoutMs,
  })

  const outboundQueueProcessor = createOutboundQueueProcessor({
    logger,
    repository: outboundMessagesRepository,
    sender: {
      sendMessage: bot.sendMessage,
      sendDocument: bot.sendDocument,
      sendPhoto: bot.sendPhoto,
    },
    retryPolicy: {
      maxAttempts: config.outboundMaxAttempts,
      baseDelayMs: config.outboundRetryBaseMs,
      maxDelayMs: config.outboundRetryMaxMs,
    },
    userProfileRepository,
    jobsRepository,
  })

  const processOutboundQueue = async (): Promise<void> => {
    try {
      await outboundQueueProcessor.drainDueMessages()
    } catch (error) {
      const err = error as Error
      logger.error({ error: err.message }, "Failed to process outbound Telegram queue")
    }
  }

  const describeMediaForUser = (update: TelegramInboundMediaUpdate, index: number): string => {
    if (update.media.fileName && update.media.fileName.trim().length > 0) {
      return update.media.fileName
    }

    return `${update.media.mediaType} ${index + 1}`
  }

  const createMediaGroupPromptSourceMessageId = (
    chatId: number,
    mediaGroupId: string,
    sourceMessageIds: string[]
  ): string => {
    const normalizedIds = [...sourceMessageIds].sort().join("+")
    return `media-group:${chatId}:${mediaGroupId}:${normalizedIds}`
  }

  const flushMediaGroupBatch = async (batchKey: string): Promise<void> => {
    const pendingBatch = pendingMediaGroupBatches.get(batchKey)
    if (!pendingBatch) {
      return
    }

    if (inFlightChats.has(pendingBatch.chatId)) {
      if (pendingBatch.timer) {
        clearTimeout(pendingBatch.timer)
      }

      pendingBatch.timer = setTimeout(() => {
        void flushMediaGroupBatch(batchKey)
      }, TELEGRAM_MEDIA_GROUP_FLUSH_DELAY_MS)
      return
    }

    pendingMediaGroupBatches.delete(batchKey)
    if (pendingBatch.timer) {
      clearTimeout(pendingBatch.timer)
      pendingBatch.timer = null
    }

    logger.info(
      {
        chatId: pendingBatch.chatId,
        userId: pendingBatch.userId,
        mediaGroupId: pendingBatch.mediaGroupId,
        mediaCount: pendingBatch.updates.length,
      },
      "Processing inbound Telegram media group"
    )

    inFlightChats.add(pendingBatch.chatId)

    const skippedItems: string[] = []
    const downloadableItems: Array<{
      sourceMessageId: string
      media: TelegramInboundMediaPayload
      dataUrl: string
      filename: string | undefined
      downloadedBytes: number
    }> = []

    try {
      for (const [index, update] of pendingBatch.updates.entries()) {
        const now = Date.now()
        const insertResult = mediaInboundMessagesRepository.insertOrIgnore({
          id: randomUUID(),
          sourceMessageId: update.sourceMessageId,
          chatId: update.chatId,
          userId: update.userId,
          telegramFileId: update.media.fileId,
          telegramFileUniqueId: update.media.fileUniqueId,
          mediaType: update.media.mediaType,
          mimeType: update.media.mimeType,
          fileName: update.media.fileName,
          fileSizeBytes: update.media.fileSizeBytes,
          downloadedSizeBytes: null,
          caption: update.media.caption,
          status: "accepted",
          rejectReason: null,
          errorMessage: null,
          createdAt: now,
          updatedAt: now,
        })

        if (insertResult === "duplicate") {
          logger.info(
            { sourceMessageId: update.sourceMessageId },
            "Skipping duplicate inbound Telegram media message"
          )
          skippedItems.push(`${describeMediaForUser(update, index)} (duplicate)`)
          continue
        }

        const validation = validateInboundMediaPayload(update.media, {
          maxBytes: TELEGRAM_MEDIA_MAX_BYTES,
          allowedMimeTypes:
            update.media.mediaType === "document"
              ? ALLOWED_DOCUMENT_MIME_TYPES
              : ALLOWED_PHOTO_MIME_TYPES,
          downloadTimeoutMs: TELEGRAM_MEDIA_DOWNLOAD_TIMEOUT_MS,
        })

        if (!validation.accepted) {
          mediaInboundMessagesRepository.markRejected(update.sourceMessageId, validation.reason)
          skippedItems.push(`${describeMediaForUser(update, index)} (${validation.reason})`)
          continue
        }

        let downloadedBytes: number | null = null
        try {
          const descriptor = await bot.resolveFileDownload(update.media.fileId)
          const downloaded = await downloadInboundMediaFile(descriptor, {
            maxBytes: TELEGRAM_MEDIA_MAX_BYTES,
            downloadTimeoutMs: TELEGRAM_MEDIA_DOWNLOAD_TIMEOUT_MS,
          })
          downloadedBytes = downloaded.bytes

          try {
            const resolvedMimeType = update.media.mimeType || "application/octet-stream"
            const dataUrl = await buildMediaDataUrl(downloaded.filePath, resolvedMimeType)
            const filename = update.media.fileName ?? descriptor.fileName ?? undefined

            downloadableItems.push({
              sourceMessageId: update.sourceMessageId,
              media: update.media,
              dataUrl,
              filename,
              downloadedBytes,
            })
          } finally {
            await downloaded.cleanup()
          }
        } catch (error) {
          const err = error as Error
          mediaInboundMessagesRepository.markFailed(
            update.sourceMessageId,
            err.message,
            Date.now(),
            downloadedBytes
          )

          logger.error(
            { error: err.message, chatId: update.chatId, sourceMessageId: update.sourceMessageId },
            "Failed to process Telegram media message"
          )
          skippedItems.push(`${describeMediaForUser(update, index)} (download_failed)`)
        }
      }

      if (downloadableItems.length === 0) {
        await bot.sendMessage(
          pendingBatch.chatId,
          "I could not process any files in that album. Please try again with supported file types and sizes."
        )
        return
      }

      const captionHints = downloadableItems
        .map((item, index) => {
          const caption = item.media.caption?.trim()
          if (!caption) {
            return null
          }

          return `File ${index + 1} caption: ${caption}`
        })
        .filter((value): value is string => value != null)

      const parts = [
        {
          type: "text" as const,
          text:
            captionHints.length > 0
              ? [
                  `User sent ${downloadableItems.length} files in one message. Analyze them together and respond helpfully.`,
                  ...captionHints,
                ].join("\n")
              : `User sent ${downloadableItems.length} files in one message. Analyze them together and respond helpfully.`,
        },
        ...downloadableItems.map((item) => ({
          type: "file" as const,
          mime: item.media.mimeType || "application/octet-stream",
          filename: item.filename,
          url: item.dataUrl,
        })),
      ]

      const storageText = [
        `[media_group:${pendingBatch.mediaGroupId}] ${downloadableItems.length} files`,
        ...captionHints,
      ].join(" | ")

      const mediaHandleResult = await bridge.handleMediaMessage({
        sourceMessageId: createMediaGroupPromptSourceMessageId(
          pendingBatch.chatId,
          pendingBatch.mediaGroupId,
          downloadableItems.map((item) => item.sourceMessageId)
        ),
        chatId: pendingBatch.chatId,
        userId: pendingBatch.userId,
        storageText,
        parts,
      })

      if (mediaHandleResult.outcome === "processed") {
        for (const item of downloadableItems) {
          mediaInboundMessagesRepository.markProcessed(
            item.sourceMessageId,
            Date.now(),
            item.downloadedBytes
          )
        }
      } else if (mediaHandleResult.outcome === "duplicate") {
        for (const item of downloadableItems) {
          mediaInboundMessagesRepository.markProcessed(
            item.sourceMessageId,
            Date.now(),
            item.downloadedBytes
          )
        }
      } else if (mediaHandleResult.outcome === "failed") {
        for (const item of downloadableItems) {
          mediaInboundMessagesRepository.markFailed(
            item.sourceMessageId,
            mediaHandleResult.errorMessage,
            Date.now(),
            item.downloadedBytes
          )
        }
      }

      if (skippedItems.length > 0) {
        await bot.sendMessage(
          pendingBatch.chatId,
          `Processed ${downloadableItems.length} file(s). Skipped ${skippedItems.length}: ${skippedItems.join(", ")}.`
        )
      }
    } catch (error) {
      const err = error as Error

      logger.error(
        {
          error: err.message,
          chatId: pendingBatch.chatId,
          mediaGroupId: pendingBatch.mediaGroupId,
        },
        "Failed to process Telegram media group"
      )

      await bot.sendMessage(
        pendingBatch.chatId,
        "I could not process those files right now. Please try again in a moment."
      )
    } finally {
      inFlightChats.delete(pendingBatch.chatId)
    }
  }

  const enqueueMediaGroupUpdate = (update: TelegramInboundMediaUpdate): void => {
    const mediaGroupId = update.media.mediaGroupId
    if (!mediaGroupId) {
      return
    }

    const batchKey = `${update.chatId}:${mediaGroupId}`
    const existingBatch = pendingMediaGroupBatches.get(batchKey)

    if (existingBatch) {
      existingBatch.updates.push(update)
      if (existingBatch.timer) {
        clearTimeout(existingBatch.timer)
      }
      existingBatch.timer = setTimeout(() => {
        void flushMediaGroupBatch(batchKey)
      }, TELEGRAM_MEDIA_GROUP_FLUSH_DELAY_MS)
      return
    }

    const timer = setTimeout(() => {
      void flushMediaGroupBatch(batchKey)
    }, TELEGRAM_MEDIA_GROUP_FLUSH_DELAY_MS)

    pendingMediaGroupBatches.set(batchKey, {
      chatId: update.chatId,
      userId: update.userId,
      mediaGroupId,
      updates: [update],
      timer,
    })
  }

  bot.onTextMessage(async (update) => {
    try {
      logger.info(
        {
          sourceMessageId: update.sourceMessageId,
          chatId: update.chatId,
          userId: update.userId,
          messageType: "text",
          textLength: update.text.length,
        },
        "Received inbound Telegram text message"
      )

      const context = extractTelegramAccessContext(update.update)
      const decision = evaluateTelegramAccess(context, {
        allowedUserId: config.allowedUserId,
      })
      logDeniedTelegramAccess(logger, decision, context)

      if (!decision.allowed) {
        return
      }

      if (!onboardingPromptedChats.has(update.chatId)) {
        const profile = userProfileRepository.get()
        if (!isProfileOnboardingComplete(profile)) {
          onboardingPromptedChats.add(update.chatId)
          await bot.sendMessage(
            update.chatId,
            [
              "Before I start proactive heartbeats, I should configure your notification profile.",
              "Suggested defaults: timezone Europe/Vienna, quiet hours 20:00-08:00, and heartbeat windows 08:30 / 12:30 / 19:00.",
              "You can tell me naturally, for example: 'quiet hours 21:00-07:30 and mute until tomorrow 08:00'.",
            ].join("\n")
          )
        }
      }

      if (inFlightChats.has(update.chatId)) {
        await bot.sendMessage(
          update.chatId,
          "I am still processing your previous message. Please wait."
        )
        return
      }

      inFlightChats.add(update.chatId)

      try {
        await bridge.handleTextMessage({
          sourceMessageId: update.sourceMessageId,
          chatId: update.chatId,
          userId: update.userId,
          text: update.text,
        })
      } finally {
        inFlightChats.delete(update.chatId)
      }
    } catch (error) {
      const err = error as Error
      logger.error(
        { error: err.message, sourceMessageId: update.sourceMessageId, chatId: update.chatId },
        "Failed to process inbound Telegram text message"
      )

      await bot.sendMessage(
        update.chatId,
        "Something went wrong while handling that message. Please try again."
      )
    }
  })

  bot.onVoiceMessage(async (update) => {
    try {
      logger.info(
        {
          sourceMessageId: update.sourceMessageId,
          chatId: update.chatId,
          userId: update.userId,
          messageType: update.voice.inputType,
          mimeType: update.voice.mimeType,
          durationSec: update.voice.durationSec,
          fileSizeBytes: update.voice.fileSizeBytes,
        },
        "Received inbound Telegram media message for transcription"
      )

      const context = extractTelegramAccessContext(update.update)
      const decision = evaluateTelegramAccess(context, {
        allowedUserId: config.allowedUserId,
      })
      logDeniedTelegramAccess(logger, decision, context)

      if (!decision.allowed) {
        return
      }

      if (!config.voice.enabled) {
        await bot.sendMessage(
          update.chatId,
          "Voice input is currently disabled. Please send text for now."
        )
        return
      }

      if (!transcriptionGateway) {
        await bot.sendMessage(
          update.chatId,
          "I cannot transcribe voice messages on this installation yet. Please send text for now."
        )
        return
      }

      if (inFlightChats.has(update.chatId)) {
        await bot.sendMessage(
          update.chatId,
          "I am still processing your previous message. Please wait."
        )
        return
      }

      const now = Date.now()
      const insertResult = voiceInboundMessagesRepository.insertOrIgnore({
        id: randomUUID(),
        sourceMessageId: update.sourceMessageId,
        chatId: update.chatId,
        userId: update.userId,
        telegramFileId: update.voice.fileId,
        telegramFileUniqueId: update.voice.fileUniqueId,
        durationSeconds: update.voice.durationSec,
        mimeType: update.voice.mimeType,
        fileSizeBytes: update.voice.fileSizeBytes,
        downloadedSizeBytes: null,
        status: "accepted",
        rejectReason: null,
        errorMessage: null,
        transcript: null,
        transcriptLanguage: null,
        createdAt: now,
        updatedAt: now,
      })

      if (insertResult === "duplicate") {
        logger.info(
          { sourceMessageId: update.sourceMessageId },
          "Skipping duplicate inbound Telegram voice message"
        )
        return
      }

      const validation = validateVoicePayload(update.voice, config.voice)
      if (!validation.accepted) {
        logger.info(
          {
            sourceMessageId: update.sourceMessageId,
            chatId: update.chatId,
            reason: validation.reason,
          },
          "Rejected inbound Telegram media before transcription"
        )
        voiceInboundMessagesRepository.markRejected(update.sourceMessageId, validation.reason)
        await bot.sendMessage(update.chatId, validation.message)
        return
      }

      inFlightChats.add(update.chatId)

      let downloadedBytes: number | null = null
      try {
        logger.info(
          { sourceMessageId: update.sourceMessageId, chatId: update.chatId },
          "Resolving Telegram media download URL"
        )
        const descriptor = await bot.resolveVoiceDownload(update.voice.fileId)
        logger.info(
          {
            sourceMessageId: update.sourceMessageId,
            chatId: update.chatId,
            mediaFileName: descriptor.fileName,
            mediaFileSizeBytes: descriptor.fileSizeBytes,
          },
          "Downloading Telegram media file for transcription"
        )
        const downloaded = await downloadVoiceFile(descriptor, config.voice)
        downloadedBytes = downloaded.bytes
        logger.info(
          {
            sourceMessageId: update.sourceMessageId,
            chatId: update.chatId,
            downloadedBytes,
          },
          "Downloaded Telegram media file"
        )

        try {
          logger.info(
            {
              sourceMessageId: update.sourceMessageId,
              chatId: update.chatId,
              provider: config.transcription.provider,
              timeoutMs: config.transcription.timeoutMs,
            },
            "Starting local transcription"
          )
          const transcription = await transcriptionGateway.transcribe({
            audioFilePath: downloaded.filePath,
            mimeType: update.voice.mimeType,
            language: config.transcription.language,
            model: config.transcription.model,
            timeoutMs: config.transcription.timeoutMs,
          })

          voiceInboundMessagesRepository.markTranscribed(
            update.sourceMessageId,
            transcription.text,
            transcription.language,
            Date.now(),
            downloadedBytes
          )

          logger.info(
            {
              sourceMessageId: update.sourceMessageId,
              chatId: update.chatId,
              transcriptLength: transcription.text.length,
              language: transcription.language,
            },
            "Completed local transcription"
          )

          await bridge.handleTextMessage({
            sourceMessageId: update.sourceMessageId,
            chatId: update.chatId,
            userId: update.userId,
            text: transcription.text,
          })
        } finally {
          await downloaded.cleanup()
        }
      } catch (error) {
        const err = error as Error
        const normalized = err.message.toLowerCase()

        if (normalized.includes("size limit") || normalized.includes("too large")) {
          voiceInboundMessagesRepository.markRejected(
            update.sourceMessageId,
            "size_exceeded",
            Date.now(),
            downloadedBytes
          )
          await bot.sendMessage(
            update.chatId,
            `That voice message is too large. Please keep it under ${Math.floor(config.voice.maxBytes / (1024 * 1024))} MB.`
          )
          return
        }

        voiceInboundMessagesRepository.markFailed(
          update.sourceMessageId,
          err.message,
          Date.now(),
          downloadedBytes
        )

        logger.error(
          { error: err.message, chatId: update.chatId, sourceMessageId: update.sourceMessageId },
          "Failed to process Telegram voice message"
        )

        await bot.sendMessage(
          update.chatId,
          "I could not transcribe that voice message right now. Please try again in a moment."
        )
      } finally {
        inFlightChats.delete(update.chatId)
      }
    } catch (error) {
      const err = error as Error
      logger.error(
        { error: err.message, sourceMessageId: update.sourceMessageId, chatId: update.chatId },
        "Unhandled error while processing Telegram media message"
      )

      await bot.sendMessage(
        update.chatId,
        "Something went wrong while handling that media message. Please try again."
      )
    }
  })

  bot.onMediaMessage(async (update) => {
    try {
      logger.info(
        {
          sourceMessageId: update.sourceMessageId,
          chatId: update.chatId,
          userId: update.userId,
          mediaType: update.media.mediaType,
          mediaGroupId: update.media.mediaGroupId,
          mimeType: update.media.mimeType,
          fileSizeBytes: update.media.fileSizeBytes,
          hasCaption: Boolean(update.media.caption),
        },
        "Received inbound Telegram document/photo message"
      )

      const context = extractTelegramAccessContext(update.update)
      const decision = evaluateTelegramAccess(context, {
        allowedUserId: config.allowedUserId,
      })
      logDeniedTelegramAccess(logger, decision, context)

      if (!decision.allowed) {
        return
      }

      if (update.media.mediaGroupId) {
        enqueueMediaGroupUpdate(update)
        return
      }

      if (inFlightChats.has(update.chatId)) {
        await bot.sendMessage(
          update.chatId,
          "I am still processing your previous message. Please wait."
        )
        return
      }

      const now = Date.now()
      const insertResult = mediaInboundMessagesRepository.insertOrIgnore({
        id: randomUUID(),
        sourceMessageId: update.sourceMessageId,
        chatId: update.chatId,
        userId: update.userId,
        telegramFileId: update.media.fileId,
        telegramFileUniqueId: update.media.fileUniqueId,
        mediaType: update.media.mediaType,
        mimeType: update.media.mimeType,
        fileName: update.media.fileName,
        fileSizeBytes: update.media.fileSizeBytes,
        downloadedSizeBytes: null,
        caption: update.media.caption,
        status: "accepted",
        rejectReason: null,
        errorMessage: null,
        createdAt: now,
        updatedAt: now,
      })

      if (insertResult === "duplicate") {
        logger.info(
          { sourceMessageId: update.sourceMessageId },
          "Skipping duplicate inbound Telegram media message"
        )
        return
      }

      const validation = validateInboundMediaPayload(update.media, {
        maxBytes: TELEGRAM_MEDIA_MAX_BYTES,
        allowedMimeTypes:
          update.media.mediaType === "document"
            ? ALLOWED_DOCUMENT_MIME_TYPES
            : ALLOWED_PHOTO_MIME_TYPES,
        downloadTimeoutMs: TELEGRAM_MEDIA_DOWNLOAD_TIMEOUT_MS,
      })

      if (!validation.accepted) {
        mediaInboundMessagesRepository.markRejected(update.sourceMessageId, validation.reason)
        await bot.sendMessage(update.chatId, validation.message)
        return
      }

      inFlightChats.add(update.chatId)
      let downloadedBytes: number | null = null

      try {
        const descriptor = await bot.resolveFileDownload(update.media.fileId)
        const downloaded = await downloadInboundMediaFile(descriptor, {
          maxBytes: TELEGRAM_MEDIA_MAX_BYTES,
          downloadTimeoutMs: TELEGRAM_MEDIA_DOWNLOAD_TIMEOUT_MS,
        })
        downloadedBytes = downloaded.bytes

        try {
          const resolvedMimeType = update.media.mimeType || "application/octet-stream"
          const dataUrl = await buildMediaDataUrl(downloaded.filePath, resolvedMimeType)
          const filename = update.media.fileName ?? descriptor.fileName ?? undefined
          const parts = [
            {
              type: "text" as const,
              text:
                update.media.caption && update.media.caption.trim().length > 0
                  ? `User sent a ${update.media.mediaType} with caption: ${update.media.caption.trim()}`
                  : `User sent a ${update.media.mediaType}. Analyze it and respond helpfully.`,
            },
            {
              type: "file" as const,
              mime: resolvedMimeType,
              filename,
              url: dataUrl,
            },
          ]

          const storageText =
            update.media.caption && update.media.caption.trim().length > 0
              ? `[${update.media.mediaType}] ${update.media.caption.trim()}`
              : `[${update.media.mediaType}] ${filename ?? "media"}`

          const mediaHandleResult = await bridge.handleMediaMessage({
            sourceMessageId: update.sourceMessageId,
            chatId: update.chatId,
            userId: update.userId,
            storageText,
            parts,
          })

          if (mediaHandleResult.outcome === "processed") {
            mediaInboundMessagesRepository.markProcessed(
              update.sourceMessageId,
              Date.now(),
              downloadedBytes
            )
          } else if (mediaHandleResult.outcome === "failed") {
            mediaInboundMessagesRepository.markFailed(
              update.sourceMessageId,
              mediaHandleResult.errorMessage,
              Date.now(),
              downloadedBytes
            )
          }
        } finally {
          await downloaded.cleanup()
        }
      } catch (error) {
        const err = error as Error
        mediaInboundMessagesRepository.markFailed(
          update.sourceMessageId,
          err.message,
          Date.now(),
          downloadedBytes
        )

        logger.error(
          { error: err.message, chatId: update.chatId, sourceMessageId: update.sourceMessageId },
          "Failed to process Telegram media message"
        )

        await bot.sendMessage(
          update.chatId,
          "I could not process that file right now. Please try again in a moment."
        )
      } finally {
        inFlightChats.delete(update.chatId)
      }
    } catch (error) {
      const err = error as Error
      logger.error(
        { error: err.message, sourceMessageId: update.sourceMessageId, chatId: update.chatId },
        "Unhandled error while processing Telegram media message"
      )

      await bot.sendMessage(
        update.chatId,
        "Something went wrong while handling that file. Please try again."
      )
    }
  })

  bot.onUnsupportedMediaMessage(async (update) => {
    try {
      logger.info(
        {
          sourceMessageId: update.sourceMessageId,
          chatId: update.chatId,
          userId: update.userId,
          messageType: update.mediaType,
        },
        "Received unsupported Telegram media message"
      )

      const context = extractTelegramAccessContext(update.update)
      const decision = evaluateTelegramAccess(context, {
        allowedUserId: config.allowedUserId,
      })
      logDeniedTelegramAccess(logger, decision, context)

      if (!decision.allowed) {
        return
      }

      await bot.sendMessage(
        update.chatId,
        "I cannot process this media type yet. Please send text, voice/audio, a document, or a photo."
      )
    } catch (error) {
      const err = error as Error
      logger.error(
        { error: err.message, sourceMessageId: update.sourceMessageId, chatId: update.chatId },
        "Unhandled error while processing unsupported Telegram media message"
      )

      await bot.sendMessage(
        update.chatId,
        "I could not process that media message. Please send text, voice/audio, a document, or a photo."
      )
    }
  })

  const scheduleLaunchRetry = (): void => {
    if (stopRequested || launchRetryTimer) {
      return
    }

    launchRetryTimer = setTimeout(() => {
      launchRetryTimer = null
      void ensureBotLaunched()
    }, TELEGRAM_LAUNCH_RETRY_DELAY_MS)
  }

  const ensureBotLaunched = async (): Promise<void> => {
    if (stopRequested || launchInFlight) {
      return
    }

    launchInFlight = true
    try {
      await bot.launch()
      logger.info("Telegram bot polling started")
    } catch (error) {
      const err = error as Error
      logger.error(
        { error: err.message },
        "Telegram bot launch failed; inbound updates may be unavailable"
      )
      scheduleLaunchRetry()
    } finally {
      launchInFlight = false
    }
  }

  void ensureBotLaunched()

  logger.info(
    {
      heartbeatMs: config.heartbeatMs,
      outboundPollMs: config.outboundPollMs,
      outboundMaxAttempts: config.outboundMaxAttempts,
      outboundRetryBaseMs: config.outboundRetryBaseMs,
      outboundRetryMaxMs: config.outboundRetryMaxMs,
      hasBotToken: true,
      allowedUserId: config.allowedUserId,
      opencodeBaseUrl: config.opencodeBaseUrl,
      voiceEnabled: config.voice.enabled,
      transcriptionProvider: config.transcription.provider,
    },
    "Telegram worker started"
  )

  const heartbeatTimer = setInterval(() => {
    logger.debug({ heartbeatMs: config.heartbeatMs }, "Telegram worker heartbeat")
  }, config.heartbeatMs)

  await processOutboundQueue()
  const outboundQueueTimer = setInterval(() => {
    void processOutboundQueue()
  }, config.outboundPollMs)

  return {
    stop: async () => {
      stopRequested = true
      for (const pendingBatch of pendingMediaGroupBatches.values()) {
        if (pendingBatch.timer) {
          clearTimeout(pendingBatch.timer)
        }
      }
      pendingMediaGroupBatches.clear()
      if (launchRetryTimer) {
        clearTimeout(launchRetryTimer)
        launchRetryTimer = null
      }
      clearInterval(heartbeatTimer)
      clearInterval(outboundQueueTimer)
      if (transcriptionGateway) {
        await transcriptionGateway.close()
      }
      await bot.stop()
      database.close()
      logger.info("Telegram worker stopped")
    },
  }
}
