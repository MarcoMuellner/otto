import path from "node:path"
import { access } from "node:fs/promises"
import { constants } from "node:fs"

import type { Logger } from "pino"

import {
  ensureOttoConfigFile,
  readOttoModelFlowDefaults,
  updateOttoModelFlowDefaults,
} from "../config/otto-config.js"
import {
  buildExternalSystemStatusSnapshot,
  resolveExternalApiConfig,
  startExternalApiServer,
} from "../external-api/server.js"
import { resolveInternalApiConfig, startInternalApiServer } from "../internal-api/server.js"
import { startOpencodeServer } from "../opencode/server.js"
import {
  createModelCatalogService,
  createOpencodeModelClient,
  createRuntimeModelResolver,
  type ModelCatalogService,
} from "../model-management/index.js"
import { openPersistenceDatabase } from "../persistence/index.js"
import { createJobsRepository } from "../persistence/repositories.js"
import { createOutboundMessagesRepository } from "../persistence/repositories.js"
import { createSessionBindingsRepository } from "../persistence/repositories.js"
import { createTaskAuditRepository } from "../persistence/repositories.js"
import { createCommandAuditRepository } from "../persistence/repositories.js"
import { createUserProfileRepository } from "../persistence/repositories.js"
import {
  materializeEffectiveOpencodeConfig,
  syncOpencodeToolsPackageJson,
} from "../extensions/index.js"
import { ensureHeartbeatTask, HEARTBEAT_DEFAULT_CADENCE_MINUTES } from "../scheduler/heartbeat.js"
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
  const runtimeStartedAt = Date.now()
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
  await syncOpencodeToolsPackageJson(config.ottoHome)
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
  const userProfileRepository = createUserProfileRepository(persistenceDatabase)
  const internalApiConfig = await resolveInternalApiConfig(config.ottoHome)
  const externalApiConfig = await resolveExternalApiConfig(config.ottoHome)
  const schedulerConfig = resolveSchedulerConfig()
  const systemServiceStates: Record<
    "runtime" | "opencode" | "internal_api" | "external_api" | "scheduler" | "telegram_worker",
    {
      label: string
      status: "ok" | "degraded" | "disabled"
      message: string
    }
  > = {
    runtime: {
      label: "Otto Runtime",
      status: "ok",
      message: "Runtime process is active",
    },
    opencode: {
      label: "OpenCode Server",
      status: "degraded",
      message: "OpenCode server is starting",
    },
    internal_api: {
      label: "Internal API",
      status: "degraded",
      message: "Internal API is starting",
    },
    external_api: {
      label: "External API",
      status: "degraded",
      message: "External API is starting",
    },
    scheduler: {
      label: "Scheduler",
      status: "degraded",
      message: "Scheduler is starting",
    },
    telegram_worker: {
      label: "Telegram Worker",
      status: "degraded",
      message: "Telegram worker is starting",
    },
  }

  process.env.OTTO_INTERNAL_API_URL = internalApiConfig.baseUrl
  process.env.OTTO_INTERNAL_API_TOKEN = internalApiConfig.token
  process.env.OTTO_EXTERNAL_API_URL = externalApiConfig.baseUrl

  let internalApiServer: { url: string; close: () => Promise<void> } | null = null
  let externalApiServer: { url: string; close: () => Promise<void> } | null = null
  let modelCatalogService: ModelCatalogService | null = null

  try {
    internalApiServer = await startInternalApiServer({
      logger,
      config: internalApiConfig,
      ottoHome: config.ottoHome,
      outboundMessagesRepository,
      sessionBindingsRepository,
      jobsRepository,
      userProfileRepository,
      taskAuditRepository,
      commandAuditRepository,
    })
    systemServiceStates.internal_api = {
      ...systemServiceStates.internal_api,
      status: "ok",
      message: "Internal API is reachable",
    }
  } catch (error) {
    persistenceDatabase.close()
    throw error
  }

  if (!internalApiServer) {
    persistenceDatabase.close()
    throw new Error("Internal API server failed to start")
  }

  try {
    externalApiServer = await startExternalApiServer({
      logger,
      config: externalApiConfig,
      systemStatusProvider: () => {
        return buildExternalSystemStatusSnapshot({
          startedAt: runtimeStartedAt,
          services: [
            {
              id: "runtime",
              ...systemServiceStates.runtime,
            },
            {
              id: "opencode",
              ...systemServiceStates.opencode,
            },
            {
              id: "internal_api",
              ...systemServiceStates.internal_api,
            },
            {
              id: "external_api",
              ...systemServiceStates.external_api,
            },
            {
              id: "scheduler",
              ...systemServiceStates.scheduler,
            },
            {
              id: "telegram_worker",
              ...systemServiceStates.telegram_worker,
            },
          ],
        })
      },
      restartRuntime: async () => {
        logger.warn({ source: "external_api" }, "Runtime restart requested")
        setTimeout(() => {
          try {
            process.kill(process.pid, "SIGTERM")
          } catch (error) {
            const err = error as Error
            logger.error({ error: err.message }, "Failed to send runtime restart signal")
          }
        }, 150)
      },
      jobsRepository,
      taskAuditRepository,
      commandAuditRepository,
      userProfileRepository,
      modelManagement: {
        getCatalogSnapshot: () => {
          if (!modelCatalogService) {
            throw new Error("Model catalog service is not ready")
          }

          return modelCatalogService.getSnapshot()
        },
        refreshCatalog: async () => {
          if (!modelCatalogService) {
            throw new Error("Model catalog service is not ready")
          }

          return await modelCatalogService.refreshNow()
        },
        getFlowDefaults: async () => {
          return await readOttoModelFlowDefaults(homeDirectory)
        },
        updateFlowDefaults: async (flowDefaults) => {
          const updated = await updateOttoModelFlowDefaults(flowDefaults, homeDirectory)
          return updated.modelManagement.flowDefaults
        },
      },
    })
    systemServiceStates.external_api = {
      ...systemServiceStates.external_api,
      status: "ok",
      message: "External API is reachable",
    }
  } catch (error) {
    await internalApiServer.close()
    persistenceDatabase.close()
    throw error
  }

  if (!externalApiServer) {
    await internalApiServer.close()
    persistenceDatabase.close()
    throw new Error("External API server failed to start")
  }

  let server: { url: string; close: () => void } | null = null
  let schedulerKernel: { stop: () => Promise<void> } | null = null
  let telegramWorker: TelegramWorkerHandle | null = null
  let stopModelCatalogRefresh: (() => void) | null = null

  try {
    server = await startOpencodeServer({
      hostname: config.opencode.hostname,
      port: config.opencode.port,
      configPath: opencodeConfigPath,
    })
    systemServiceStates.opencode = {
      ...systemServiceStates.opencode,
      status: "ok",
      message: "OpenCode server is reachable",
    }
  } catch (error) {
    await externalApiServer.close()
    await internalApiServer.close()
    persistenceDatabase.close()
    throw error
  }

  try {
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
        externalApiUrl: externalApiServer.url,
        externalApiTokenPath: externalApiConfig.tokenPath,
      },
      "OpenCode server started"
    )

    const opencodeModelClient = createOpencodeModelClient(server.url)
    modelCatalogService = createModelCatalogService({
      logger,
      ottoHome: config.ottoHome,
      fetchCatalogRefs: opencodeModelClient.fetchCatalogRefs,
    })
    await modelCatalogService.ensureInitialFetch()
    modelCatalogService.startPeriodicRefresh()
    stopModelCatalogRefresh = modelCatalogService.stopPeriodicRefresh

    const modelResolver = createRuntimeModelResolver({
      logger,
      getCatalogSnapshot: modelCatalogService.getSnapshot,
      fetchGlobalDefaultModelRef: opencodeModelClient.fetchGlobalDefaultModelRef,
      loadOttoConfig: async () => {
        const resolved = await ensureOttoConfigFile(homeDirectory)
        return resolved.config
      },
    })

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

    const heartbeatEnsureResult = ensureHeartbeatTask(
      jobsRepository,
      {
        cadenceMinutes: HEARTBEAT_DEFAULT_CADENCE_MINUTES,
        chatId: watchdogChatId,
      },
      Date.now
    )
    logger.info(
      {
        taskId: heartbeatEnsureResult.taskId,
        created: heartbeatEnsureResult.created,
        cadenceMinutes: heartbeatEnsureResult.cadenceMinutes,
        hasChatId: Boolean(watchdogChatId),
      },
      "Heartbeat task ensured"
    )

    const schedulerSessionGateway = createOpencodeSessionGateway(server.url, logger, modelResolver)
    const taskExecutionEngine = createTaskExecutionEngine({
      logger,
      ottoHome: config.ottoHome,
      jobsRepository,
      sessionBindingsRepository,
      outboundMessagesRepository,
      userProfileRepository,
      sessionGateway: schedulerSessionGateway,
      defaultWatchdogChatId: watchdogChatId,
    })

    schedulerKernel = await startSchedulerKernel({
      logger,
      jobsRepository,
      config: schedulerConfig,
      executeClaimedJob: taskExecutionEngine.executeClaimedJob,
    })
    systemServiceStates.scheduler = {
      ...systemServiceStates.scheduler,
      status: "ok",
      message: "Scheduler kernel is active",
    }

    try {
      const telegramConfig = resolveTelegramWorkerConfig(config.telegram)
      telegramWorker = await startTelegramWorker(logger, telegramConfig, {
        createSessionGateway: async (baseUrl) => {
          return createOpencodeSessionGateway(baseUrl, logger, modelResolver)
        },
      })
      systemServiceStates.telegram_worker = {
        ...systemServiceStates.telegram_worker,
        status: telegramConfig.enabled ? "ok" : "disabled",
        message: telegramConfig.enabled
          ? "Telegram worker is active"
          : "Telegram worker disabled in configuration",
      }
      logger.info({ enabled: telegramConfig.enabled }, "Telegram worker startup completed")
    } catch (error) {
      const err = error as Error
      systemServiceStates.telegram_worker = {
        ...systemServiceStates.telegram_worker,
        status: "degraded",
        message: `Telegram worker unavailable: ${err.message}`,
      }
      logger.warn(
        { error: err.message },
        "Telegram worker did not start; continuing serve mode without Telegram"
      )
    }

    const signal = await waitForShutdownSignal()

    logger.info({ signal }, "Shutdown signal received")
  } finally {
    if (telegramWorker) {
      await telegramWorker.stop()
    }
    if (schedulerKernel) {
      await schedulerKernel.stop()
    }
    if (stopModelCatalogRefresh) {
      stopModelCatalogRefresh()
    }
    server.close()
    await externalApiServer.close()
    await internalApiServer.close()
    persistenceDatabase.close()

    logger.info("OpenCode server stopped")
  }
}
