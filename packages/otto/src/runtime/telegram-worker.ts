import type { Logger } from "pino"

import { ensureOttoConfigFile } from "../config/otto-config.js"
import {
  createModelCatalogService,
  createOpencodeModelClient,
  createRuntimeModelResolver,
} from "../model-management/index.js"
import { resolveTelegramWorkerConfig } from "../telegram-worker/config.js"
import { createOpencodeSessionGateway } from "../telegram-worker/opencode.js"
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
  const { config: ottoConfig } = await ensureOttoConfigFile()
  const telegramConfig = resolveTelegramWorkerConfig(ottoConfig.telegram)

  const opencodeModelClient = createOpencodeModelClient(telegramConfig.opencodeBaseUrl)
  const modelCatalogService = createModelCatalogService({
    logger,
    ottoHome: ottoConfig.ottoHome,
    fetchCatalogRefs: opencodeModelClient.fetchCatalogRefs,
  })
  await modelCatalogService.ensureInitialFetch()
  modelCatalogService.startPeriodicRefresh()

  const modelResolver = createRuntimeModelResolver({
    logger,
    getCatalogSnapshot: modelCatalogService.getSnapshot,
    fetchGlobalDefaultModelRef: opencodeModelClient.fetchGlobalDefaultModelRef,
    loadOttoConfig: async () => {
      const resolved = await ensureOttoConfigFile()
      return resolved.config
    },
  })

  let worker: Awaited<ReturnType<typeof startTelegramWorker>> | null = null

  try {
    worker = await startTelegramWorker(logger, telegramConfig, {
      createSessionGateway: async (baseUrl) => {
        return createOpencodeSessionGateway(baseUrl, logger, modelResolver)
      },
    })

    const signal = await waitForShutdownSignal()
    logger.info({ signal }, "Telegram worker shutdown signal received")
  } finally {
    if (worker) {
      await worker.stop()
    }
    modelCatalogService.stopPeriodicRefresh()
  }
}
