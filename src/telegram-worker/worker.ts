import type { Logger } from "pino"
import { Telegraf } from "telegraf"

import { openPersistenceDatabase } from "../persistence/index.js"
import { createInboundMessagesRepository } from "../persistence/repositories.js"
import { createOutboundMessagesRepository } from "../persistence/repositories.js"
import { createSessionBindingsRepository } from "../persistence/repositories.js"
import type { TelegramWorkerConfig } from "./config.js"
import { createInboundBridge } from "./inbound.js"
import type { OpencodeSessionGateway } from "./opencode.js"
import {
  evaluateTelegramAccess,
  extractTelegramAccessContext,
  logDeniedTelegramAccess,
} from "./security.js"
import type Database from "better-sqlite3"

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

export type TelegramBotRuntime = {
  onTextMessage: (handler: (update: TelegramInboundUpdate) => Promise<void>) => void
  sendMessage: (chatId: number, text: string) => Promise<void>
  launch: () => Promise<void>
  stop: () => Promise<void>
}

export type TelegramWorkerDependencies = {
  createBotRuntime?: (botToken: string) => TelegramBotRuntime
  openDatabase?: () => Database.Database
  createSessionGateway?: (
    baseUrl: string
  ) => Promise<OpencodeSessionGateway> | OpencodeSessionGateway
}

const createTelegrafRuntime = (botToken: string): TelegramBotRuntime => {
  const bot = new Telegraf(botToken)

  return {
    onTextMessage: (handler) => {
      bot.on("message", async (context) => {
        const message = context.message
        if (!message || !("text" in message)) {
          return
        }

        await handler({
          sourceMessageId: String(message.message_id),
          chatId: context.chat.id,
          userId: context.from?.id ?? 0,
          text: message.text,
          update: context.update,
        })
      })
    },
    sendMessage: async (chatId, text) => {
      await bot.telegram.sendMessage(chatId, text)
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
  const outboundMessagesRepository = createOutboundMessagesRepository(database)
  const sessionGatewayFactory =
    dependencies.createSessionGateway ??
    (async (baseUrl: string): Promise<OpencodeSessionGateway> => {
      const module = await import("./opencode.js")
      return module.createOpencodeSessionGateway(baseUrl)
    })

  const sessionGateway = await sessionGatewayFactory(config.opencodeBaseUrl)
  const bot =
    dependencies.createBotRuntime?.(config.botToken) ?? createTelegrafRuntime(config.botToken)
  const inFlightChats = new Set<number>()

  const bridge = createInboundBridge({
    logger,
    sender: {
      sendMessage: bot.sendMessage,
    },
    sessionGateway,
    sessionBindingsRepository,
    inboundMessagesRepository,
    outboundMessagesRepository,
    promptTimeoutMs: config.promptTimeoutMs,
  })

  bot.onTextMessage(async (update) => {
    const context = extractTelegramAccessContext(update.update)
    const decision = evaluateTelegramAccess(context, {
      allowedUserId: config.allowedUserId,
      allowedChatId: config.allowedChatId,
    })
    logDeniedTelegramAccess(logger, decision, context)

    if (!decision.allowed) {
      return
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
  })

  try {
    await bot.launch()
  } catch (error) {
    database.close()
    throw error
  }

  logger.info(
    {
      heartbeatMs: config.heartbeatMs,
      hasBotToken: true,
      allowedUserId: config.allowedUserId,
      allowedChatId: config.allowedChatId,
      opencodeBaseUrl: config.opencodeBaseUrl,
    },
    "Telegram worker started"
  )

  const heartbeatTimer = setInterval(() => {
    logger.debug({ heartbeatMs: config.heartbeatMs }, "Telegram worker heartbeat")
  }, config.heartbeatMs)

  return {
    stop: async () => {
      clearInterval(heartbeatTimer)
      await bot.stop()
      database.close()
      logger.info("Telegram worker stopped")
    },
  }
}
