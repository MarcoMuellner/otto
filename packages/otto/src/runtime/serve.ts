import path from "node:path"
import { randomUUID } from "node:crypto"
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
import type { JobRecord } from "../persistence/repositories.js"
import { createJobsRepository } from "../persistence/repositories.js"
import { createJobRunSessionsRepository } from "../persistence/repositories.js"
import { createOutboundMessagesRepository } from "../persistence/repositories.js"
import { createSessionBindingsRepository } from "../persistence/repositories.js"
import { createTaskAuditRepository } from "../persistence/repositories.js"
import { createCommandAuditRepository } from "../persistence/repositories.js"
import { createEodLearningRepository } from "../persistence/repositories.js"
import { createInteractiveContextEventsRepository } from "../persistence/repositories.js"
import { createUserProfileRepository } from "../persistence/repositories.js"
import {
  listManagedPromptFiles,
  readManagedPromptFile,
  resolveInteractiveSystemPrompt,
  writeManagedPromptFile,
} from "../prompt-management/index.js"
import {
  materializeEffectiveOpencodeConfig,
  syncOpencodeToolsPackageJson,
} from "../extensions/index.js"
import { resolveSchedulerConfig } from "../scheduler/config.js"
import { createTaskExecutionEngine } from "../scheduler/executor.js"
import { startSchedulerKernel } from "../scheduler/kernel.js"
import { ensureEodLearningTask } from "../scheduler/eod-learning.js"
import { createNonInteractiveContextCaptureService } from "./non-interactive-context-capture.js"
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
  const jobRunSessionsRepository = createJobRunSessionsRepository(persistenceDatabase)
  const taskAuditRepository = createTaskAuditRepository(persistenceDatabase)
  const commandAuditRepository = createCommandAuditRepository(persistenceDatabase)
  const eodLearningRepository = createEodLearningRepository(persistenceDatabase)
  const outboundMessagesRepository = createOutboundMessagesRepository(persistenceDatabase)
  const interactiveContextEventsRepository =
    createInteractiveContextEventsRepository(persistenceDatabase)
  const sessionBindingsRepository = createSessionBindingsRepository(persistenceDatabase)
  const userProfileRepository = createUserProfileRepository(persistenceDatabase)
  const nonInteractiveContextCaptureService = createNonInteractiveContextCaptureService({
    logger,
    interactiveContextEventsRepository,
  })
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
  let interactiveSessionController: { closeSession: (sessionId: string) => Promise<void> } | null =
    null
  let executeBackgroundJobNow: ((jobId: string) => Promise<void>) | null = null

  try {
    internalApiServer = await startInternalApiServer({
      logger,
      config: internalApiConfig,
      ottoHome: config.ottoHome,
      outboundMessagesRepository,
      sessionBindingsRepository,
      jobRunSessionsRepository,
      sessionController: {
        closeSession: async (sessionId: string): Promise<void> => {
          if (!interactiveSessionController?.closeSession) {
            throw new Error("Session close is unavailable")
          }

          await interactiveSessionController.closeSession(sessionId)
        },
      },
      jobsRepository,
      userProfileRepository,
      taskAuditRepository,
      commandAuditRepository,
      nonInteractiveContextCaptureService,
      promptManagement: {
        readPromptFile: async (input) => {
          return await readManagedPromptFile({
            ottoHome: config.ottoHome,
            source: input.source,
            relativePath: input.relativePath,
          })
        },
        writePromptFile: async (input) => {
          return await writeManagedPromptFile({
            ottoHome: config.ottoHome,
            source: input.source,
            relativePath: input.relativePath,
            content: input.content,
          })
        },
      },
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
      executeBackgroundJobNow: async (jobId: string): Promise<void> => {
        if (!executeBackgroundJobNow) {
          throw new Error("Background execution engine is not ready")
        }

        await executeBackgroundJobNow(jobId)
      },
      isBackgroundExecutionReady: () => executeBackgroundJobNow !== null,
      jobRunSessionsRepository,
      sessionController: {
        closeSession: async (sessionId: string): Promise<void> => {
          if (!interactiveSessionController?.closeSession) {
            throw new Error("Session close is unavailable")
          }

          await interactiveSessionController.closeSession(sessionId)
        },
      },
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
      promptManagement: {
        resolveInteractiveSystemPrompt: async (surface) => {
          return await resolveInteractiveSystemPrompt({
            ottoHome: config.ottoHome,
            surface,
            logger,
          })
        },
        listPromptFiles: async () => {
          return await listManagedPromptFiles({ ottoHome: config.ottoHome })
        },
        readPromptFile: async (input) => {
          return await readManagedPromptFile({
            ottoHome: config.ottoHome,
            source: input.source,
            relativePath: input.relativePath,
          })
        },
        writePromptFile: async (input) => {
          return await writeManagedPromptFile({
            ottoHome: config.ottoHome,
            source: input.source,
            relativePath: input.relativePath,
            content: input.content,
          })
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
    ensureSystemBootstrapTasks({
      logger,
      jobsRepository,
      timezone: userProfileRepository.get()?.timezone ?? null,
      watchdogChatId,
      now: Date.now,
    })

    const schedulerSessionGateway = createOpencodeSessionGateway(server.url, logger, modelResolver)
    interactiveSessionController = schedulerSessionGateway.closeSession
      ? {
          closeSession: schedulerSessionGateway.closeSession,
        }
      : null
    const taskExecutionEngine = createTaskExecutionEngine({
      logger,
      ottoHome: config.ottoHome,
      jobsRepository,
      jobRunSessionsRepository,
      sessionBindingsRepository,
      outboundMessagesRepository,
      userProfileRepository,
      taskAuditRepository,
      commandAuditRepository,
      interactiveContextEventsRepository,
      eodLearningRepository,
      sessionGateway: schedulerSessionGateway,
      defaultWatchdogChatId: watchdogChatId,
      nonInteractiveContextCaptureService,
    })
    executeBackgroundJobNow = async (jobId: string): Promise<void> => {
      const now = Date.now()
      const lockToken = randomUUID()
      const claimed = jobsRepository.claimById(
        jobId,
        now,
        lockToken,
        schedulerConfig.lockLeaseMs,
        now
      )

      if (!claimed) {
        logger.warn({ jobId }, "Background job claim skipped for immediate dispatch")
        return
      }

      try {
        await taskExecutionEngine.executeClaimedJob(claimed)
      } catch (error) {
        const err = error as Error
        logger.error(
          {
            jobId,
            error: err.message,
          },
          "Immediate background job execution failed"
        )
        jobsRepository.releaseLock(jobId, lockToken, Date.now())
        throw error
      }
    }

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
        interactiveContextEventsRepository,
        resolveInteractiveSystemPrompt: async () => {
          const resolved = await resolveInteractiveSystemPrompt({
            ottoHome: config.ottoHome,
            surface: "telegram",
            logger,
          })

          logger.info(
            {
              channel: "telegram",
              flow: resolved.flow,
              surface: resolved.surface,
              media: resolved.media,
              systemPrompt: resolved.systemPrompt,
              provenance: resolved.provenance,
              warnings: resolved.warnings,
            },
            "Resolved interactive system prompt for Telegram"
          )

          return resolved.systemPrompt.trim().length > 0 ? resolved.systemPrompt : undefined
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

/**
 * Ensures long-lived system-owned scheduler tasks at runtime startup so deployable services
 * always recover required recurring jobs after restarts.
 *
 * @param dependencies Logger, repositories, and bootstrap context values.
 */
export const ensureSystemBootstrapTasks = (dependencies: {
  logger: Pick<Logger, "info">
  jobsRepository: {
    getById: (jobId: string) => JobRecord | null
    createTask: (record: JobRecord) => void
  }
  timezone: string | null
  watchdogChatId: number | null
  now?: () => number
}): void => {
  const now = dependencies.now ?? Date.now

  const watchdogEnsureResult = ensureWatchdogTask(
    dependencies.jobsRepository,
    {
      cadenceMinutes: WATCHDOG_DEFAULT_CADENCE_MINUTES,
      chatId: dependencies.watchdogChatId,
    },
    now
  )
  dependencies.logger.info(
    {
      taskId: watchdogEnsureResult.taskId,
      created: watchdogEnsureResult.created,
      cadenceMinutes: watchdogEnsureResult.cadenceMinutes,
      hasChatId: Boolean(dependencies.watchdogChatId),
    },
    "Watchdog task ensured"
  )

  const eodEnsureResult = ensureEodLearningTask(
    dependencies.jobsRepository,
    {
      timezone: dependencies.timezone,
    },
    now
  )
  dependencies.logger.info(
    {
      taskId: eodEnsureResult.taskId,
      created: eodEnsureResult.created,
      cadenceMinutes: eodEnsureResult.cadenceMinutes,
      timezone: eodEnsureResult.timezone,
      nextRunAt: eodEnsureResult.nextRunAt,
      nextRunAtIso: new Date(eodEnsureResult.nextRunAt).toISOString(),
    },
    "EOD learning task ensured"
  )
}
