import type { Logger } from "pino"

import { resolveTelegramWorkerConfig } from "../telegram-worker/config.js"
import { startTelegramWorker } from "../telegram-worker/worker.js"

/**
 * Waits for process shutdown signals so long-running worker commands keep a stable lifetime
 * under terminals, service managers, and test harnesses.
 *
 * @returns First shutdown signal observed by the process.
 */
const waitForShutdownSignal = async (): Promise<NodeJS.Signals> => {
  return await new Promise((resolve) => {
    const onSignal = (signal: NodeJS.Signals): void => {
      process.off("SIGINT", onSignal)
      process.off("SIGTERM", onSignal)
      resolve(signal)
    }

    process.on("SIGINT", onSignal)
    process.on("SIGTERM", onSignal)
  })
}

/**
 * Runs Telegram worker mode as a dedicated runtime command so communication infrastructure
 * can evolve independently from setup and OpenCode serve responsibilities.
 *
 * @param logger Command-scoped logger for worker lifecycle events.
 */
export const runTelegramWorker = async (logger: Logger): Promise<void> => {
  const config = resolveTelegramWorkerConfig()
  const worker = await startTelegramWorker(logger, config)

  const signal = await waitForShutdownSignal()
  logger.info({ signal }, "Telegram worker shutdown signal received")

  await worker.stop()
}
