import type { Logger } from "pino"

import type { TelegramWorkerConfig } from "./config.js"

export type TelegramWorkerHandle = {
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
  if (!config.enabled) {
    logger.info("Telegram worker disabled by configuration")
    return {
      stop: () => {
        logger.info("Telegram worker stop requested while disabled")
      },
    }
  }

  logger.info(
    {
      heartbeatMs: config.heartbeatMs,
      hasBotToken: Boolean(config.botToken),
    },
    "Telegram worker started"
  )

  if (!config.botToken) {
    logger.warn("Telegram worker running without TELEGRAM_BOT_TOKEN")
  }

  const heartbeatTimer = setInterval(() => {
    logger.debug({ heartbeatMs: config.heartbeatMs }, "Telegram worker heartbeat")
  }, config.heartbeatMs)

  return {
    stop: () => {
      clearInterval(heartbeatTimer)
      logger.info("Telegram worker stopped")
    },
  }
}
