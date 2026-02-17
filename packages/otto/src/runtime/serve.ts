import path from "node:path"
import { access } from "node:fs/promises"
import { constants } from "node:fs"

import type { Logger } from "pino"

import { ensureOttoConfigFile } from "../config/otto-config.js"
import { resolveInternalApiConfig, startInternalApiServer } from "../internal-api/server.js"
import { startOpencodeServer } from "../opencode/server.js"
import { openPersistenceDatabase } from "../persistence/index.js"
import { createJobsRepository } from "../persistence/repositories.js"
import { createOutboundMessagesRepository } from "../persistence/repositories.js"
import { createSessionBindingsRepository } from "../persistence/repositories.js"
import { createTaskAuditRepository } from "../persistence/repositories.js"
import { createCommandAuditRepository } from "../persistence/repositories.js"
import { materializeEffectiveOpencodeConfig } from "../extensions/index.js"
import { resolveSchedulerConfig } from "../scheduler/config.js"
import { createTaskExecutionEngine } from "../scheduler/executor.js"
import { startSchedulerKernel } from "../scheduler/kernel.js"
import {
  ensureWatchdogTask,
  resolveDefaultWatchdogChatId,
  WATCHDOG_DEFAULT_CADENCE_MINUTES,
} from "../scheduler/watchdog.js"
import { resolveTelegramWorkerConfig } from "../telegram-worker/config.js"
import { createOpencodeSessionGateway } from "../telegram-worker/opencode.js"
import { startTelegramWorker, type TelegramWorkerHandle } from "../telegram-worker/worker.js"

/**
 * Keeps process lifetime tied to OS signals so the server can shut down cleanly in local
 * terminals, supervisors, and containerized runtimes.
 *
 * @returns First shutdown signal received by the process.
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
 * Runs Otto in serve mode without mutating installation state, which preserves a clean
 * boundary between setup-time deployment and runtime execution.
 *
 * @param logger Command-scoped logger for runtime telemetry.
 * @param homeDirectory Optional home override used by tests and embedding.
 */
export const runServe = async (logger: Logger, homeDirectory?: string): Promise<void> => {
  const { config, configPath, created } = await ensureOttoConfigFile(homeDirectory)

  if (created) {
    logger.info({ configPath }, "Created default Otto config file")
  }

  const opencodeConfigPath = path.join(config.ottoHome, "opencode.jsonc")
  const agentsPath = path.join(config.ottoHome, "AGENTS.md")

  await access(opencodeConfigPath, constants.F_OK).catch(() => {
    throw new Error(`OpenCode config not found at ${opencodeConfigPath}. Run "otto setup" first.`)
  })

  await access(agentsPath, constants.F_OK).catch(() => {
    throw new Error(`AGENTS file not found at ${agentsPath}. Run "otto setup" first.`)
  })

  process.chdir(config.ottoHome)

  const effectiveConfig = await materializeEffectiveOpencodeConfig(config.ottoHome)
  logger.info(
    {
      command: "serve",
      opencodeConfigPath: effectiveConfig.configPath,
      mergedMcpKeys: effectiveConfig.mergedMcpKeys,
      effectiveOpencodeConfig: effectiveConfig.source,
    },
    "Effective OpenCode config materialized"
  )

  const persistenceDatabase = openPersistenceDatabase({ ottoHome: config.ottoHome })
  const jobsRepository = createJobsRepository(persistenceDatabase)
  const taskAuditRepository = createTaskAuditRepository(persistenceDatabase)
  const commandAuditRepository = createCommandAuditRepository(persistenceDatabase)
  const outboundMessagesRepository = createOutboundMessagesRepository(persistenceDatabase)
  const sessionBindingsRepository = createSessionBindingsRepository(persistenceDatabase)
  const internalApiConfig = await resolveInternalApiConfig(config.ottoHome)
  const schedulerConfig = resolveSchedulerConfig()

  process.env.OTTO_INTERNAL_API_URL = internalApiConfig.baseUrl
  process.env.OTTO_INTERNAL_API_TOKEN = internalApiConfig.token

  let internalApiServer: { url: string; close: () => Promise<void> } | null = null

  try {
    internalApiServer = await startInternalApiServer({
      logger,
      config: internalApiConfig,
      outboundMessagesRepository,
      sessionBindingsRepository,
      jobsRepository,
      taskAuditRepository,
      commandAuditRepository,
    })
  } catch (error) {
    persistenceDatabase.close()
    throw error
  }

  if (!internalApiServer) {
    persistenceDatabase.close()
    throw new Error("Internal API server failed to start")
  }

  let server: { url: string; close: () => void } | null = null
  let schedulerKernel: { stop: () => Promise<void> } | null = null
  let telegramWorker: TelegramWorkerHandle | null = null

  try {
    server = await startOpencodeServer({
      hostname: config.opencode.hostname,
      port: config.opencode.port,
      configPath: opencodeConfigPath,
    })
  } catch (error) {
    await internalApiServer.close()
    persistenceDatabase.close()
    throw error
  }

  logger.info(
    {
      command: "serve",
      configPath,
      opencodeConfigPath,
      ottoHome: config.ottoHome,
      hostname: config.opencode.hostname,
      port: config.opencode.port,
      url: server.url,
      internalApiUrl: internalApiServer.url,
      internalApiTokenPath: internalApiConfig.tokenPath,
    },
    "OpenCode server started"
  )

  const watchdogChatId = resolveDefaultWatchdogChatId()
  const watchdogEnsureResult = ensureWatchdogTask(
    jobsRepository,
    {
      cadenceMinutes: WATCHDOG_DEFAULT_CADENCE_MINUTES,
      chatId: watchdogChatId,
    },
    Date.now
  )
  logger.info(
    {
      taskId: watchdogEnsureResult.taskId,
      created: watchdogEnsureResult.created,
      cadenceMinutes: watchdogEnsureResult.cadenceMinutes,
      hasChatId: Boolean(watchdogChatId),
    },
    "Watchdog task ensured"
  )

  const schedulerSessionGateway = createOpencodeSessionGateway(server.url, logger)
  const taskExecutionEngine = createTaskExecutionEngine({
    logger,
    ottoHome: config.ottoHome,
    jobsRepository,
    sessionBindingsRepository,
    outboundMessagesRepository,
    sessionGateway: schedulerSessionGateway,
    defaultWatchdogChatId: watchdogChatId,
  })

  schedulerKernel = await startSchedulerKernel({
    logger,
    jobsRepository,
    config: schedulerConfig,
    executeClaimedJob: taskExecutionEngine.executeClaimedJob,
  })

  try {
    const telegramConfig = resolveTelegramWorkerConfig()
    telegramWorker = await startTelegramWorker(logger, telegramConfig)
    logger.info({ enabled: telegramConfig.enabled }, "Telegram worker startup completed")
  } catch (error) {
    const err = error as Error
    logger.warn(
      { error: err.message },
      "Telegram worker did not start; continuing serve mode without Telegram"
    )
  }

  const signal = await waitForShutdownSignal()

  logger.info({ signal }, "Shutdown signal received")

  if (telegramWorker) {
    await telegramWorker.stop()
  }
  if (schedulerKernel) {
    await schedulerKernel.stop()
  }
  server.close()
  await internalApiServer.close()
  persistenceDatabase.close()

  logger.info("OpenCode server stopped")
}
