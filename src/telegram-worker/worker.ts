import type { Logger } from "pino"

import type { TelegramWorkerConfig } from "./config.js"
import {
  evaluateTelegramAccess,
  extractTelegramAccessContext,
  logDeniedTelegramAccess,
} from "./security.js"

export type TelegramWorkerHandle = {
  canProcessUpdate: (update: unknown) => boolean
  stop: () => void
}

/**
 * Starts a dedicated Telegram worker shell process so comms lifecycle can be exercised
 * independently before full Telegram transport behavior is added.
 *
 * @param logger Component-scoped logger for worker telemetry.
 * @param config Resolved worker configuration.
 * @returns Handle used by runtime orchestrators to stop the worker.
 */
export const startTelegramWorker = (
  logger: Logger,
  config: TelegramWorkerConfig
): TelegramWorkerHandle => {
  const canProcessUpdate = (update: unknown): boolean => {
    const context = extractTelegramAccessContext(update)
    const decision = evaluateTelegramAccess(context, {
      allowedUserId: config.allowedUserId,
      allowedChatId: config.allowedChatId,
    })

    logDeniedTelegramAccess(logger, decision, context)

    return decision.allowed
  }

  if (!config.enabled) {
    logger.info("Telegram worker disabled by configuration")
    return {
      canProcessUpdate,
      stop: () => {
        logger.info("Telegram worker stop requested while disabled")
      },
    }
  }

  logger.info(
    {
      heartbeatMs: config.heartbeatMs,
      hasBotToken: Boolean(config.botToken),
      allowedUserId: config.allowedUserId,
      allowedChatId: config.allowedChatId,
    },
    "Telegram worker started"
  )

  const heartbeatTimer = setInterval(() => {
    logger.debug({ heartbeatMs: config.heartbeatMs }, "Telegram worker heartbeat")
  }, config.heartbeatMs)

  return {
    canProcessUpdate,
    stop: () => {
      clearInterval(heartbeatTimer)
      logger.info("Telegram worker stopped")
    },
  }
}
