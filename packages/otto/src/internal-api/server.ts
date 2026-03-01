import { randomUUID } from "node:crypto"

import Fastify, { type FastifyInstance } from "fastify"
import type { Logger } from "pino"
import { z, ZodError } from "zod"

import {
  cancelInteractiveBackgroundJob,
  getInteractiveBackgroundJobById,
  listInteractiveBackgroundJobs,
} from "../api-services/interactive-background-jobs-control.js"
import { listTasksForLane } from "../api-services/tasks-read.js"
import {
  createTaskMutation,
  deleteTaskMutation,
  TaskMutationError,
  updateTaskMutation,
} from "../api-services/tasks-mutations.js"
import { spawnInteractiveBackgroundJob } from "../api-services/interactive-background-jobs.js"
import {
  applyNotificationProfileUpdate,
  diffNotificationProfileFields,
  notificationProfileUpdateSchema,
  resolveNotificationProfile,
} from "../api-services/settings-notification-profile.js"
import { extractBearerToken } from "../api/http-auth.js"
import { resolveApiTokenPath, resolveOrCreateApiToken } from "../api/token.js"
import type { OutboundMessageEnqueueRepository } from "../telegram-worker/outbound-enqueue.js"
import { enqueueTelegramFile } from "../telegram-worker/outbound-enqueue.js"
import { enqueueTelegramMessage } from "../telegram-worker/outbound-enqueue.js"
import { stageOutboundTelegramFile } from "../telegram-worker/outbound-file-staging.js"
import type {
  CommandAuditRecord,
  FailedJobRunRecord,
  JobRecord,
  JobRunRecord,
  JobRunSessionRecord,
  JobScheduleType,
  TaskAuditRecord,
  TaskListRecord,
  UserProfileRecord,
} from "../persistence/repositories.js"
import { checkTaskFailures, resolveDefaultWatchdogChatId } from "../scheduler/watchdog.js"

const DEFAULT_HOST = "127.0.0.1"
const DEFAULT_PORT = 4180
const TELEGRAM_OUTBOUND_MAX_FILE_BYTES = 20 * 1024 * 1024

export type InternalApiConfig = {
  host: string
  port: number
  token: string
  tokenPath: string
  baseUrl: string
}

type InternalApiServerDependencies = {
  logger: Logger
  config: InternalApiConfig
  ottoHome?: string
  outboundMessagesRepository: OutboundMessageEnqueueRepository
  sessionBindingsRepository: {
    getTelegramChatIdBySessionId: (sessionId: string) => number | null
  }
  jobsRepository: {
    getById: (jobId: string) => JobRecord | null
    createTask: (record: JobRecord) => void
    updateTask: (
      jobId: string,
      update: {
        type: string
        scheduleType: JobScheduleType
        profileId: string | null
        modelRef: string | null
        runAt: number | null
        cadenceMinutes: number | null
        payload: string | null
        nextRunAt: number | null
      },
      updatedAt?: number
    ) => void
    cancelTask: (jobId: string, reason: string | null, updatedAt?: number) => void
    runTaskNow: (jobId: string, scheduledFor: number, updatedAt?: number) => void
    listTasks: () => TaskListRecord[]
    listRunsByJobId?: (
      jobId: string,
      options?: {
        limit?: number
        offset?: number
      }
    ) => JobRunRecord[]
    listRecentFailedRuns: (sinceTimestamp: number, limit?: number) => FailedJobRunRecord[]
  }
  jobRunSessionsRepository?: {
    listActiveByJobId: (jobId: string) => JobRunSessionRecord[]
    markClosed: (runId: string, closedAt: number, closeErrorMessage: string | null) => void
  }
  sessionController?: {
    closeSession: (sessionId: string) => Promise<void>
  }
  taskAuditRepository: {
    insert: (record: TaskAuditRecord) => void
    listRecent: (limit?: number) => TaskAuditRecord[]
  }
  commandAuditRepository: {
    insert: (record: CommandAuditRecord) => void
    listRecent: (limit?: number) => CommandAuditRecord[]
  }
  userProfileRepository: {
    get: () => UserProfileRecord | null
    upsert: (record: UserProfileRecord) => void
    setMuteUntil: (muteUntil: number | null, updatedAt?: number) => void
  }
}

const queueTelegramMessageApiSchema = z.object({
  sessionId: z.string().trim().min(1).optional(),
  chatId: z.number().int().optional(),
  content: z.string().trim().min(1),
  dedupeKey: z.string().trim().min(1).max(512).optional(),
  priority: z.enum(["low", "normal", "high", "critical"]).optional(),
})

const queueTelegramFileApiSchema = z.object({
  sessionId: z.string().trim().min(1).optional(),
  chatId: z.number().int().optional(),
  kind: z.enum(["document", "photo"]),
  filePath: z.string().trim().min(1),
  mimeType: z.string().trim().min(1),
  fileName: z.string().trim().min(1).optional(),
  caption: z.string().trim().max(4000).optional(),
  dedupeKey: z.string().trim().min(1).max(512).optional(),
  priority: z.enum(["low", "normal", "high", "critical"]).optional(),
})

const executionLaneSchema = z.enum(["interactive", "scheduled"])

const createTaskApiSchema = z
  .object({
    lane: executionLaneSchema,
    id: z.string().trim().min(1).optional(),
    type: z.string().trim().min(1),
    scheduleType: z.enum(["recurring", "oneshot"]),
    runAt: z.number().int().optional(),
    cadenceMinutes: z.number().int().min(1).optional(),
    payload: z.record(z.string(), z.unknown()).optional(),
    profileId: z.string().trim().min(1).optional(),
  })
  .superRefine((input, ctx) => {
    if (input.scheduleType === "oneshot" && input.runAt == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "runAt is required for oneshot tasks",
      })
    }

    if (input.scheduleType === "recurring" && input.cadenceMinutes == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "cadenceMinutes is required for recurring tasks",
      })
    }
  })

const updateTaskApiSchema = z
  .object({
    lane: executionLaneSchema,
    id: z.string().trim().min(1),
    type: z.string().trim().min(1).optional(),
    scheduleType: z.enum(["recurring", "oneshot"]).optional(),
    runAt: z.number().int().nullable().optional(),
    cadenceMinutes: z.number().int().min(1).nullable().optional(),
    payload: z.record(z.string(), z.unknown()).nullable().optional(),
    profileId: z.string().trim().min(1).nullable().optional(),
  })
  .superRefine((input, ctx) => {
    if (input.scheduleType === "recurring" && input.cadenceMinutes === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "cadenceMinutes cannot be null for recurring tasks",
      })
    }

    if (input.scheduleType === "oneshot" && input.runAt === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "runAt cannot be null for oneshot tasks",
      })
    }
  })

const deleteTaskApiSchema = z.object({
  lane: executionLaneSchema,
  id: z.string().trim().min(1),
  reason: z.string().trim().min(1).optional(),
})

const listTasksApiSchema = z.object({
  lane: executionLaneSchema,
})

const listTaskAuditApiSchema = z.object({
  lane: executionLaneSchema,
  limit: z.number().int().min(1).max(200).optional(),
})

const checkTaskFailuresApiSchema = z.object({
  lane: executionLaneSchema,
  sessionId: z.string().trim().min(1).optional(),
  lookbackMinutes: z
    .number()
    .int()
    .min(5)
    .max(24 * 60)
    .optional(),
  maxFailures: z.number().int().min(1).max(200).optional(),
  threshold: z.number().int().min(1).max(50).optional(),
  notify: z.boolean().optional(),
  chatId: z.number().int().positive().optional(),
})

const getNotificationProfileApiSchema = z.object({
  lane: executionLaneSchema,
})

const setNotificationProfileApiSchema = z
  .object({
    lane: executionLaneSchema,
  })
  .extend(notificationProfileUpdateSchema.shape)

const spawnBackgroundJobApiSchema = z.object({
  lane: executionLaneSchema.optional().default("interactive"),
  sessionId: z.string().trim().min(1).optional(),
  request: z.string().trim().min(1),
  rationale: z.string().trim().min(1).max(500).optional(),
  sourceMessageId: z.string().trim().min(1).optional(),
})

const listBackgroundJobsApiSchema = z.object({
  lane: executionLaneSchema.optional().default("interactive"),
  limit: z.number().int().min(1).max(200).optional(),
})

const showBackgroundJobApiSchema = z.object({
  lane: executionLaneSchema.optional().default("interactive"),
  jobId: z.string().trim().min(1),
})

const cancelBackgroundJobApiSchema = z.object({
  lane: executionLaneSchema.optional().default("interactive"),
  jobId: z.string().trim().min(1),
  reason: z.string().trim().min(1).optional(),
})

const canMutateTasks = (lane: "interactive" | "scheduled"): boolean => {
  return lane === "interactive"
}

const assertTaskMutationLane = (
  logger: Logger,
  lane: "interactive" | "scheduled",
  action: "create" | "update" | "delete"
):
  | { allowed: true }
  | { allowed: false; statusCode: 403; body: { error: "lane_forbidden"; message: string } } => {
  if (canMutateTasks(lane)) {
    return { allowed: true }
  }

  logger.warn(
    {
      lane,
      action,
    },
    "Denied task mutation request for execution lane"
  )

  return {
    allowed: false,
    statusCode: 403,
    body: {
      error: "lane_forbidden",
      message: "Task mutation is only allowed in interactive lane",
    },
  }
}

const assertInteractiveBackgroundLane = (
  logger: Logger,
  lane: "interactive" | "scheduled",
  action: "list" | "show" | "cancel"
):
  | { allowed: true }
  | { allowed: false; statusCode: 403; body: { error: "lane_forbidden"; message: string } } => {
  if (lane === "interactive") {
    return { allowed: true }
  }

  logger.warn(
    {
      lane,
      action,
    },
    "Denied background control request for execution lane"
  )

  return {
    allowed: false,
    statusCode: 403,
    body: {
      error: "lane_forbidden",
      message: "Background task controls are only allowed in interactive lane",
    },
  }
}

const resolveTaskMutationErrorResponse = (error: TaskMutationError) => {
  if (error.code === "invalid_request") {
    return {
      statusCode: 400,
      body: {
        error: "invalid_request",
        message: error.message,
      },
    }
  }

  if (error.code === "not_found") {
    return {
      statusCode: 404,
      body: {
        error: "not_found",
        message: error.message,
      },
    }
  }

  if (error.code === "forbidden_mutation") {
    return {
      statusCode: 403,
      body: {
        error: "forbidden_mutation",
        message: error.message,
      },
    }
  }

  return {
    statusCode: 409,
    body: {
      error: "state_conflict",
      message: error.message,
    },
  }
}

const writeCommandAudit = (
  dependencies: InternalApiServerDependencies,
  record: {
    command: string
    lane: "interactive" | "scheduled" | null
    status: "success" | "failed" | "denied"
    errorMessage?: string | null
    metadataJson?: string | null
    createdAt?: number
  }
): void => {
  dependencies.commandAuditRepository.insert({
    id: randomUUID(),
    command: record.command,
    lane: record.lane,
    status: record.status,
    errorMessage: record.errorMessage ?? null,
    metadataJson: record.metadataJson ?? null,
    createdAt: record.createdAt ?? Date.now(),
  })
}

const resolveApiHost = (environment: NodeJS.ProcessEnv): string => {
  const host = environment.OTTO_INTERNAL_API_HOST?.trim() || DEFAULT_HOST
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error("Invalid internal API config: OTTO_INTERNAL_API_HOST must be loopback")
  }

  return host
}

const resolveApiPort = (environment: NodeJS.ProcessEnv): number => {
  const rawPort = environment.OTTO_INTERNAL_API_PORT
  const port = rawPort ? Number(rawPort) : DEFAULT_PORT

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Invalid internal API config: OTTO_INTERNAL_API_PORT must be 1-65535")
  }

  return port
}

/**
 * Resolves and persists internal API credentials so local tool integrations remain secure,
 * restart-safe, and independent from ephemeral process state.
 *
 * @param ottoHome Otto home directory containing the secrets folder.
 * @param environment Optional environment override for tests.
 * @returns Internal API runtime configuration with stable persisted token.
 */
export const resolveInternalApiConfig = async (
  ottoHome: string,
  environment: NodeJS.ProcessEnv = process.env
): Promise<InternalApiConfig> => {
  const host = resolveApiHost(environment)
  const port = resolveApiPort(environment)
  const tokenPath = resolveApiTokenPath(ottoHome)
  const token = await resolveOrCreateApiToken(tokenPath)

  return {
    host,
    port,
    token,
    tokenPath,
    baseUrl: `http://${host}:${port}`,
  }
}

/**
 * Builds the internal Fastify API used by OpenCode custom tools so action execution remains
 * in Otto-owned application code with shared persistence and auditing behavior.
 *
 * @param dependencies Internal API configuration, logger, and persistence dependencies.
 * @returns Fastify instance ready for injection tests or network listen.
 */
export const buildInternalApiServer = (
  dependencies: InternalApiServerDependencies
): FastifyInstance => {
  const app = Fastify({ logger: false })
  const jobRunSessionsRepository = dependencies.jobRunSessionsRepository ?? {
    listActiveByJobId: () => [] as JobRunSessionRecord[],
    markClosed: () => {},
  }

  app.post("/internal/tools/queue-telegram-message", async (request, reply) => {
    const authorization = request.headers.authorization
    const token = extractBearerToken(authorization)

    if (!token || token !== dependencies.config.token) {
      dependencies.logger.warn(
        { hasAuthorization: Boolean(authorization) },
        "Internal API denied request"
      )
      return reply.code(401).send({ error: "unauthorized" })
    }

    try {
      const payload = queueTelegramMessageApiSchema.parse(request.body)
      const resolvedChatId =
        payload.chatId ??
        (payload.sessionId
          ? dependencies.sessionBindingsRepository.getTelegramChatIdBySessionId(payload.sessionId)
          : null) ??
        resolveDefaultWatchdogChatId()

      if (!resolvedChatId) {
        return reply.code(400).send({
          error: "missing_chat",
          message:
            "chatId is required unless sessionId is mapped or TELEGRAM_ALLOWED_USER_ID is configured",
        })
      }

      const result = enqueueTelegramMessage(
        {
          chatId: resolvedChatId,
          content: payload.content,
          dedupeKey: payload.dedupeKey,
          priority: payload.priority,
        },
        dependencies.outboundMessagesRepository
      )
      dependencies.logger.info(
        {
          route: "queue-telegram-message",
          sessionId: payload.sessionId,
          chatId: resolvedChatId,
          status: result.status,
          queuedCount: result.queuedCount,
          duplicateCount: result.duplicateCount,
          dedupeKey: result.dedupeKey,
        },
        "Internal API queued Telegram message"
      )
      writeCommandAudit(dependencies, {
        command: "queue_telegram_message",
        lane: "interactive",
        status: "success",
        metadataJson: JSON.stringify({
          chatId: resolvedChatId,
          status: result.status,
          queuedCount: result.queuedCount,
          duplicateCount: result.duplicateCount,
        }),
      })
      return reply.code(200).send(result)
    } catch (error) {
      if (error instanceof ZodError) {
        writeCommandAudit(dependencies, {
          command: "queue_telegram_message",
          lane: null,
          status: "failed",
          errorMessage: "invalid_request",
        })
        return reply.code(400).send({ error: "invalid_request", details: error.issues })
      }

      const err = error as Error
      writeCommandAudit(dependencies, {
        command: "queue_telegram_message",
        lane: null,
        status: "failed",
        errorMessage: err.message,
      })
      dependencies.logger.error({ error: err.message }, "Internal API request failed")
      return reply.code(500).send({ error: "internal_error" })
    }
  })

  app.post("/internal/tools/queue-telegram-file", async (request, reply) => {
    const authorization = request.headers.authorization
    const token = extractBearerToken(authorization)

    if (!token || token !== dependencies.config.token) {
      dependencies.logger.warn(
        { hasAuthorization: Boolean(authorization) },
        "Internal API denied request"
      )
      return reply.code(401).send({ error: "unauthorized" })
    }

    try {
      const payload = queueTelegramFileApiSchema.parse(request.body)
      const resolvedChatId =
        payload.chatId ??
        (payload.sessionId
          ? dependencies.sessionBindingsRepository.getTelegramChatIdBySessionId(payload.sessionId)
          : null) ??
        resolveDefaultWatchdogChatId()

      if (!resolvedChatId) {
        return reply.code(400).send({
          error: "missing_chat",
          message:
            "chatId is required unless sessionId is mapped or TELEGRAM_ALLOWED_USER_ID is configured",
        })
      }

      const staged = await stageOutboundTelegramFile({
        requestedPath: payload.filePath,
        ottoHome: dependencies.ottoHome ?? process.cwd(),
        maxBytes: TELEGRAM_OUTBOUND_MAX_FILE_BYTES,
      })

      const result = enqueueTelegramFile(
        {
          chatId: resolvedChatId,
          kind: payload.kind,
          filePath: staged.stagedPath,
          mimeType: payload.mimeType,
          fileName: payload.fileName ?? staged.fileName,
          caption: payload.caption,
          dedupeKey: payload.dedupeKey,
          priority: payload.priority,
        },
        dependencies.outboundMessagesRepository
      )

      dependencies.logger.info(
        {
          route: "queue-telegram-file",
          sessionId: payload.sessionId,
          chatId: resolvedChatId,
          kind: payload.kind,
          stagedPath: staged.stagedPath,
          sourcePath: staged.sourcePath,
          bytes: staged.bytes,
          status: result.status,
          queuedCount: result.queuedCount,
          duplicateCount: result.duplicateCount,
          dedupeKey: result.dedupeKey,
        },
        "Internal API queued Telegram media"
      )

      writeCommandAudit(dependencies, {
        command: "queue_telegram_file",
        lane: "interactive",
        status: "success",
        metadataJson: JSON.stringify({
          kind: payload.kind,
          chatId: resolvedChatId,
          status: result.status,
          queuedCount: result.queuedCount,
          duplicateCount: result.duplicateCount,
        }),
      })

      return reply.code(200).send(result)
    } catch (error) {
      if (error instanceof ZodError) {
        writeCommandAudit(dependencies, {
          command: "queue_telegram_file",
          lane: null,
          status: "failed",
          errorMessage: "invalid_request",
        })
        return reply.code(400).send({ error: "invalid_request", details: error.issues })
      }

      const err = error as Error
      const errnoError = error as NodeJS.ErrnoException
      if (err.message === "file_path_outside_otto_home") {
        return reply.code(400).send({
          error: "invalid_file_path",
          message: "filePath must point to a file under ottoHome",
        })
      }
      if (err.message === "file_size_exceeded") {
        return reply.code(400).send({
          error: "file_too_large",
          message: `filePath exceeds max size of ${Math.floor(TELEGRAM_OUTBOUND_MAX_FILE_BYTES / (1024 * 1024))} MB`,
        })
      }
      if (err.message === "file_path_not_a_file") {
        return reply.code(400).send({
          error: "invalid_file_path",
          message: "filePath must resolve to a regular file",
        })
      }
      if (errnoError.code === "ENOENT" || errnoError.code === "EACCES") {
        return reply.code(400).send({
          error: "invalid_file_path",
          message: "filePath could not be read",
        })
      }

      writeCommandAudit(dependencies, {
        command: "queue_telegram_file",
        lane: null,
        status: "failed",
        errorMessage: err.message,
      })
      dependencies.logger.error({ error: err.message }, "Internal API media queue request failed")
      return reply.code(500).send({ error: "internal_error" })
    }
  })

  app.post("/internal/tools/tasks/create", async (request, reply) => {
    const authorization = request.headers.authorization
    const token = extractBearerToken(authorization)

    if (!token || token !== dependencies.config.token) {
      dependencies.logger.warn(
        { hasAuthorization: Boolean(authorization) },
        "Internal API denied request"
      )
      return reply.code(401).send({ error: "unauthorized" })
    }

    try {
      const payload = createTaskApiSchema.parse(request.body)
      const laneDecision = assertTaskMutationLane(dependencies.logger, payload.lane, "create")
      if (!laneDecision.allowed) {
        writeCommandAudit(dependencies, {
          command: "create_task",
          lane: payload.lane,
          status: "denied",
          errorMessage: laneDecision.body.message,
        })
        return reply.code(laneDecision.statusCode).send(laneDecision.body)
      }

      const result = createTaskMutation(
        {
          jobsRepository: dependencies.jobsRepository,
          taskAuditRepository: dependencies.taskAuditRepository,
        },
        {
          id: payload.id,
          type: payload.type,
          scheduleType: payload.scheduleType,
          runAt: payload.runAt,
          cadenceMinutes: payload.cadenceMinutes,
          payload: payload.payload,
          profileId: payload.profileId,
        },
        {
          lane: payload.lane,
          actor: "internal_tool",
          source: "internal_api",
        }
      )

      writeCommandAudit(dependencies, {
        command: "create_task",
        lane: payload.lane,
        status: "success",
        metadataJson: JSON.stringify({ taskId: result.id }),
      })

      return reply.code(200).send(result)
    } catch (error) {
      if (error instanceof ZodError) {
        writeCommandAudit(dependencies, {
          command: "create_task",
          lane: null,
          status: "failed",
          errorMessage: "invalid_request",
        })
        return reply.code(400).send({ error: "invalid_request", details: error.issues })
      }

      if (error instanceof TaskMutationError) {
        const failure = resolveTaskMutationErrorResponse(error)
        writeCommandAudit(dependencies, {
          command: "create_task",
          lane: null,
          status: error.code === "forbidden_mutation" ? "denied" : "failed",
          errorMessage: error.message,
        })
        return reply.code(failure.statusCode).send(failure.body)
      }

      const err = error as Error
      writeCommandAudit(dependencies, {
        command: "create_task",
        lane: null,
        status: "failed",
        errorMessage: err.message,
      })
      dependencies.logger.error({ error: err.message }, "Internal API task create failed")
      return reply.code(500).send({ error: "internal_error" })
    }
  })

  app.post("/internal/tools/background-jobs/spawn", async (request, reply) => {
    const authorization = request.headers.authorization
    const token = extractBearerToken(authorization)

    if (!token || token !== dependencies.config.token) {
      dependencies.logger.warn(
        { hasAuthorization: Boolean(authorization) },
        "Internal API denied request"
      )
      return reply.code(401).send({ error: "unauthorized" })
    }

    try {
      const payload = spawnBackgroundJobApiSchema.parse(request.body)
      const laneDecision = assertTaskMutationLane(dependencies.logger, payload.lane, "create")
      if (!laneDecision.allowed) {
        writeCommandAudit(dependencies, {
          command: "spawn_background_job",
          lane: payload.lane,
          status: "denied",
          errorMessage: laneDecision.body.message,
        })
        return reply.code(laneDecision.statusCode).send(laneDecision.body)
      }

      const resolvedSessionId = payload.sessionId
      const chatId = resolvedSessionId
        ? dependencies.sessionBindingsRepository.getTelegramChatIdBySessionId(resolvedSessionId)
        : null

      const result = spawnInteractiveBackgroundJob(
        {
          jobsRepository: dependencies.jobsRepository,
          taskAuditRepository: dependencies.taskAuditRepository,
        },
        {
          request: payload.request,
          rationale: payload.rationale,
          sourceMessageId: payload.sourceMessageId,
          sessionId: resolvedSessionId,
          chatId,
        }
      )

      writeCommandAudit(dependencies, {
        command: "spawn_background_job",
        lane: payload.lane,
        status: "success",
        metadataJson: JSON.stringify({
          jobId: result.jobId,
          jobType: result.jobType,
          hasSessionId: Boolean(resolvedSessionId),
          hasChatId: Boolean(chatId),
        }),
      })

      return reply.code(200).send(result)
    } catch (error) {
      if (error instanceof ZodError) {
        writeCommandAudit(dependencies, {
          command: "spawn_background_job",
          lane: null,
          status: "failed",
          errorMessage: "invalid_request",
        })
        return reply.code(400).send({ error: "invalid_request", details: error.issues })
      }

      if (error instanceof TaskMutationError) {
        const failure = resolveTaskMutationErrorResponse(error)
        writeCommandAudit(dependencies, {
          command: "spawn_background_job",
          lane: null,
          status: error.code === "forbidden_mutation" ? "denied" : "failed",
          errorMessage: error.message,
        })
        return reply.code(failure.statusCode).send(failure.body)
      }

      const err = error as Error
      writeCommandAudit(dependencies, {
        command: "spawn_background_job",
        lane: null,
        status: "failed",
        errorMessage: err.message,
      })
      dependencies.logger.error({ error: err.message }, "Internal API background job spawn failed")
      return reply.code(500).send({ error: "internal_error" })
    }
  })

  app.post("/internal/tools/background-jobs/list", async (request, reply) => {
    const authorization = request.headers.authorization
    const token = extractBearerToken(authorization)

    if (!token || token !== dependencies.config.token) {
      dependencies.logger.warn(
        { hasAuthorization: Boolean(authorization) },
        "Internal API denied request"
      )
      return reply.code(401).send({ error: "unauthorized" })
    }

    try {
      const payload = listBackgroundJobsApiSchema.parse(request.body)
      const laneDecision = assertInteractiveBackgroundLane(
        dependencies.logger,
        payload.lane,
        "list"
      )
      if (!laneDecision.allowed) {
        writeCommandAudit(dependencies, {
          command: "list_background_tasks",
          lane: payload.lane,
          status: "denied",
          errorMessage: laneDecision.body.message,
        })
        return reply.code(laneDecision.statusCode).send(laneDecision.body)
      }

      const tasks = listInteractiveBackgroundJobs({
        jobsRepository: dependencies.jobsRepository,
      })
      const limit = payload.limit ?? 50
      const limitedTasks = tasks.slice(0, limit)

      writeCommandAudit(dependencies, {
        command: "list_background_tasks",
        lane: payload.lane,
        status: "success",
        metadataJson: JSON.stringify({
          total: tasks.length,
          returned: limitedTasks.length,
        }),
      })

      return reply.code(200).send({
        tasks: limitedTasks,
        total: tasks.length,
      })
    } catch (error) {
      if (error instanceof ZodError) {
        writeCommandAudit(dependencies, {
          command: "list_background_tasks",
          lane: null,
          status: "failed",
          errorMessage: "invalid_request",
        })
        return reply.code(400).send({ error: "invalid_request", details: error.issues })
      }

      const err = error as Error
      writeCommandAudit(dependencies, {
        command: "list_background_tasks",
        lane: null,
        status: "failed",
        errorMessage: err.message,
      })
      dependencies.logger.error({ error: err.message }, "Internal API background list failed")
      return reply.code(500).send({ error: "internal_error" })
    }
  })

  app.post("/internal/tools/background-jobs/show", async (request, reply) => {
    const authorization = request.headers.authorization
    const token = extractBearerToken(authorization)

    if (!token || token !== dependencies.config.token) {
      dependencies.logger.warn(
        { hasAuthorization: Boolean(authorization) },
        "Internal API denied request"
      )
      return reply.code(401).send({ error: "unauthorized" })
    }

    try {
      const payload = showBackgroundJobApiSchema.parse(request.body)
      const laneDecision = assertInteractiveBackgroundLane(
        dependencies.logger,
        payload.lane,
        "show"
      )
      if (!laneDecision.allowed) {
        writeCommandAudit(dependencies, {
          command: "show_background_task",
          lane: payload.lane,
          status: "denied",
          errorMessage: laneDecision.body.message,
        })
        return reply.code(laneDecision.statusCode).send(laneDecision.body)
      }

      const details = getInteractiveBackgroundJobById(
        {
          jobsRepository: dependencies.jobsRepository,
          jobRunSessionsRepository,
        },
        payload.jobId
      )

      if (!details) {
        writeCommandAudit(dependencies, {
          command: "show_background_task",
          lane: payload.lane,
          status: "failed",
          errorMessage: "Background task not found",
          metadataJson: JSON.stringify({ jobId: payload.jobId }),
        })
        return reply.code(404).send({
          error: "not_found",
          message: "Background task not found",
        })
      }

      writeCommandAudit(dependencies, {
        command: "show_background_task",
        lane: payload.lane,
        status: "success",
        metadataJson: JSON.stringify({
          jobId: payload.jobId,
          status: details.job.status,
          terminalState: details.job.terminalState,
          activeSessions: details.activeRunSessions.length,
        }),
      })

      return reply.code(200).send(details)
    } catch (error) {
      if (error instanceof ZodError) {
        writeCommandAudit(dependencies, {
          command: "show_background_task",
          lane: null,
          status: "failed",
          errorMessage: "invalid_request",
        })
        return reply.code(400).send({ error: "invalid_request", details: error.issues })
      }

      const err = error as Error
      writeCommandAudit(dependencies, {
        command: "show_background_task",
        lane: null,
        status: "failed",
        errorMessage: err.message,
      })
      dependencies.logger.error({ error: err.message }, "Internal API background show failed")
      return reply.code(500).send({ error: "internal_error" })
    }
  })

  app.post("/internal/tools/background-jobs/cancel", async (request, reply) => {
    const authorization = request.headers.authorization
    const token = extractBearerToken(authorization)

    if (!token || token !== dependencies.config.token) {
      dependencies.logger.warn(
        { hasAuthorization: Boolean(authorization) },
        "Internal API denied request"
      )
      return reply.code(401).send({ error: "unauthorized" })
    }

    try {
      const payload = cancelBackgroundJobApiSchema.parse(request.body)
      const laneDecision = assertInteractiveBackgroundLane(
        dependencies.logger,
        payload.lane,
        "cancel"
      )
      if (!laneDecision.allowed) {
        writeCommandAudit(dependencies, {
          command: "cancel_background_task",
          lane: payload.lane,
          status: "denied",
          errorMessage: laneDecision.body.message,
        })
        return reply.code(laneDecision.statusCode).send(laneDecision.body)
      }

      const result = await cancelInteractiveBackgroundJob(
        {
          jobsRepository: dependencies.jobsRepository,
          jobRunSessionsRepository,
          taskAuditRepository: dependencies.taskAuditRepository,
          sessionController: dependencies.sessionController,
        },
        {
          jobId: payload.jobId,
          reason: payload.reason,
          actor: "internal_tool",
          source: "internal_api",
        }
      )

      if (!result) {
        writeCommandAudit(dependencies, {
          command: "cancel_background_task",
          lane: payload.lane,
          status: "failed",
          errorMessage: "Background task not found",
          metadataJson: JSON.stringify({ jobId: payload.jobId }),
        })
        return reply.code(404).send({
          error: "not_found",
          message: "Background task not found",
        })
      }

      writeCommandAudit(dependencies, {
        command: "cancel_background_task",
        lane: payload.lane,
        status: "success",
        metadataJson: JSON.stringify({
          jobId: result.jobId,
          outcome: result.outcome,
          terminalState: result.terminalState,
          stopFailureCount: result.stopSessionResults.filter(
            (entry) => entry.status === "stop_failed"
          ).length,
        }),
      })

      return reply.code(200).send(result)
    } catch (error) {
      if (error instanceof ZodError) {
        writeCommandAudit(dependencies, {
          command: "cancel_background_task",
          lane: null,
          status: "failed",
          errorMessage: "invalid_request",
        })
        return reply.code(400).send({ error: "invalid_request", details: error.issues })
      }

      const err = error as Error
      writeCommandAudit(dependencies, {
        command: "cancel_background_task",
        lane: null,
        status: "failed",
        errorMessage: err.message,
      })
      dependencies.logger.error({ error: err.message }, "Internal API background cancel failed")
      return reply.code(500).send({ error: "internal_error" })
    }
  })

  app.post("/internal/tools/tasks/update", async (request, reply) => {
    const authorization = request.headers.authorization
    const token = extractBearerToken(authorization)

    if (!token || token !== dependencies.config.token) {
      dependencies.logger.warn(
        { hasAuthorization: Boolean(authorization) },
        "Internal API denied request"
      )
      return reply.code(401).send({ error: "unauthorized" })
    }

    try {
      const payload = updateTaskApiSchema.parse(request.body)
      const laneDecision = assertTaskMutationLane(dependencies.logger, payload.lane, "update")
      if (!laneDecision.allowed) {
        writeCommandAudit(dependencies, {
          command: "update_task",
          lane: payload.lane,
          status: "denied",
          errorMessage: laneDecision.body.message,
        })
        return reply.code(laneDecision.statusCode).send(laneDecision.body)
      }

      const result = updateTaskMutation(
        {
          jobsRepository: dependencies.jobsRepository,
          taskAuditRepository: dependencies.taskAuditRepository,
        },
        payload.id,
        {
          type: payload.type,
          scheduleType: payload.scheduleType,
          runAt: payload.runAt,
          cadenceMinutes: payload.cadenceMinutes,
          payload: payload.payload,
          profileId: payload.profileId,
        },
        {
          lane: payload.lane,
          actor: "internal_tool",
          source: "internal_api",
        }
      )

      writeCommandAudit(dependencies, {
        command: "update_task",
        lane: payload.lane,
        status: "success",
        metadataJson: JSON.stringify({ taskId: result.id }),
      })

      return reply.code(200).send(result)
    } catch (error) {
      if (error instanceof ZodError) {
        writeCommandAudit(dependencies, {
          command: "update_task",
          lane: null,
          status: "failed",
          errorMessage: "invalid_request",
        })
        return reply.code(400).send({ error: "invalid_request", details: error.issues })
      }

      if (error instanceof TaskMutationError) {
        const failure = resolveTaskMutationErrorResponse(error)
        writeCommandAudit(dependencies, {
          command: "update_task",
          lane: null,
          status: error.code === "forbidden_mutation" ? "denied" : "failed",
          errorMessage: error.message,
        })
        return reply.code(failure.statusCode).send(failure.body)
      }

      const err = error as Error
      writeCommandAudit(dependencies, {
        command: "update_task",
        lane: null,
        status: "failed",
        errorMessage: err.message,
      })
      dependencies.logger.error({ error: err.message }, "Internal API task update failed")
      return reply.code(500).send({ error: "internal_error" })
    }
  })

  app.post("/internal/tools/tasks/delete", async (request, reply) => {
    const authorization = request.headers.authorization
    const token = extractBearerToken(authorization)

    if (!token || token !== dependencies.config.token) {
      dependencies.logger.warn(
        { hasAuthorization: Boolean(authorization) },
        "Internal API denied request"
      )
      return reply.code(401).send({ error: "unauthorized" })
    }

    try {
      const payload = deleteTaskApiSchema.parse(request.body)
      const laneDecision = assertTaskMutationLane(dependencies.logger, payload.lane, "delete")
      if (!laneDecision.allowed) {
        writeCommandAudit(dependencies, {
          command: "delete_task",
          lane: payload.lane,
          status: "denied",
          errorMessage: laneDecision.body.message,
        })
        return reply.code(laneDecision.statusCode).send(laneDecision.body)
      }

      const result = deleteTaskMutation(
        {
          jobsRepository: dependencies.jobsRepository,
          taskAuditRepository: dependencies.taskAuditRepository,
        },
        payload.id,
        {
          reason: payload.reason,
        },
        {
          lane: payload.lane,
          actor: "internal_tool",
          source: "internal_api",
        }
      )

      writeCommandAudit(dependencies, {
        command: "delete_task",
        lane: payload.lane,
        status: "success",
        metadataJson: JSON.stringify({ taskId: result.id }),
      })
      return reply.code(200).send(result)
    } catch (error) {
      if (error instanceof ZodError) {
        writeCommandAudit(dependencies, {
          command: "delete_task",
          lane: null,
          status: "failed",
          errorMessage: "invalid_request",
        })
        return reply.code(400).send({ error: "invalid_request", details: error.issues })
      }

      if (error instanceof TaskMutationError) {
        const failure = resolveTaskMutationErrorResponse(error)
        writeCommandAudit(dependencies, {
          command: "delete_task",
          lane: null,
          status: error.code === "forbidden_mutation" ? "denied" : "failed",
          errorMessage: error.message,
        })
        return reply.code(failure.statusCode).send(failure.body)
      }

      const err = error as Error
      writeCommandAudit(dependencies, {
        command: "delete_task",
        lane: null,
        status: "failed",
        errorMessage: err.message,
      })
      dependencies.logger.error({ error: err.message }, "Internal API task delete failed")
      return reply.code(500).send({ error: "internal_error" })
    }
  })

  app.post("/internal/tools/tasks/list", async (request, reply) => {
    const authorization = request.headers.authorization
    const token = extractBearerToken(authorization)

    if (!token || token !== dependencies.config.token) {
      dependencies.logger.warn(
        { hasAuthorization: Boolean(authorization) },
        "Internal API denied request"
      )
      return reply.code(401).send({ error: "unauthorized" })
    }

    try {
      const payload = listTasksApiSchema.parse(request.body)
      const tasks = listTasksForLane(dependencies.jobsRepository, payload.lane)
      writeCommandAudit(dependencies, {
        command: "list_tasks",
        lane: payload.lane,
        status: "success",
        metadataJson: JSON.stringify({ count: tasks.length }),
      })
      return reply.code(200).send({ tasks })
    } catch (error) {
      if (error instanceof ZodError) {
        writeCommandAudit(dependencies, {
          command: "list_tasks",
          lane: null,
          status: "failed",
          errorMessage: "invalid_request",
        })
        return reply.code(400).send({ error: "invalid_request", details: error.issues })
      }

      const err = error as Error
      writeCommandAudit(dependencies, {
        command: "list_tasks",
        lane: null,
        status: "failed",
        errorMessage: err.message,
      })
      dependencies.logger.error({ error: err.message }, "Internal API task list failed")
      return reply.code(500).send({ error: "internal_error" })
    }
  })

  app.post("/internal/tools/tasks/failures/check", async (request, reply) => {
    const authorization = request.headers.authorization
    const token = extractBearerToken(authorization)

    if (!token || token !== dependencies.config.token) {
      dependencies.logger.warn(
        { hasAuthorization: Boolean(authorization) },
        "Internal API denied request"
      )
      return reply.code(401).send({ error: "unauthorized" })
    }

    try {
      const payload = checkTaskFailuresApiSchema.parse(request.body)
      const chatIdFromSession = payload.sessionId
        ? dependencies.sessionBindingsRepository.getTelegramChatIdBySessionId(payload.sessionId)
        : null
      const defaultChatId = payload.chatId ?? chatIdFromSession ?? resolveDefaultWatchdogChatId()

      const result = checkTaskFailures(
        {
          jobsRepository: dependencies.jobsRepository,
          outboundMessagesRepository: dependencies.outboundMessagesRepository,
          defaultChatId,
        },
        {
          lookbackMinutes: payload.lookbackMinutes,
          maxFailures: payload.maxFailures,
          threshold: payload.threshold,
          notify: payload.notify,
          excludeTaskTypes: ["watchdog_failures"],
        }
      )

      writeCommandAudit(dependencies, {
        command: "check_task_failures",
        lane: payload.lane,
        status: "success",
        metadataJson: JSON.stringify({
          failedCount: result.failedCount,
          shouldAlert: result.shouldAlert,
          notificationStatus: result.notificationStatus,
        }),
      })

      return reply.code(200).send(result)
    } catch (error) {
      if (error instanceof ZodError) {
        writeCommandAudit(dependencies, {
          command: "check_task_failures",
          lane: null,
          status: "failed",
          errorMessage: "invalid_request",
        })
        return reply.code(400).send({ error: "invalid_request", details: error.issues })
      }

      const err = error as Error
      writeCommandAudit(dependencies, {
        command: "check_task_failures",
        lane: null,
        status: "failed",
        errorMessage: err.message,
      })
      dependencies.logger.error({ error: err.message }, "Internal API task failures check failed")
      return reply.code(500).send({ error: "internal_error" })
    }
  })

  app.post("/internal/tools/notification-profile/get", async (request, reply) => {
    const authorization = request.headers.authorization
    const token = extractBearerToken(authorization)

    if (!token || token !== dependencies.config.token) {
      dependencies.logger.warn(
        { hasAuthorization: Boolean(authorization) },
        "Internal API denied request"
      )
      return reply.code(401).send({ error: "unauthorized" })
    }

    try {
      const payload = getNotificationProfileApiSchema.parse(request.body)
      const profile = resolveNotificationProfile(dependencies.userProfileRepository)
      writeCommandAudit(dependencies, {
        command: "get_notification_policy",
        lane: payload.lane,
        status: "success",
      })
      return reply.code(200).send({ profile })
    } catch (error) {
      if (error instanceof ZodError) {
        writeCommandAudit(dependencies, {
          command: "get_notification_policy",
          lane: null,
          status: "failed",
          errorMessage: "invalid_request",
        })
        return reply.code(400).send({ error: "invalid_request", details: error.issues })
      }

      const err = error as Error
      writeCommandAudit(dependencies, {
        command: "get_notification_policy",
        lane: null,
        status: "failed",
        errorMessage: err.message,
      })
      return reply.code(500).send({ error: "internal_error" })
    }
  })

  app.post("/internal/tools/notification-profile/set", async (request, reply) => {
    const authorization = request.headers.authorization
    const token = extractBearerToken(authorization)

    if (!token || token !== dependencies.config.token) {
      dependencies.logger.warn(
        { hasAuthorization: Boolean(authorization) },
        "Internal API denied request"
      )
      return reply.code(401).send({ error: "unauthorized" })
    }

    try {
      const payload = setNotificationProfileApiSchema.parse(request.body)
      const now = Date.now()
      const existing = resolveNotificationProfile(dependencies.userProfileRepository)
      const merged = applyNotificationProfileUpdate(existing, payload, now)
      const changedFields = diffNotificationProfileFields(existing, merged)

      dependencies.userProfileRepository.upsert(merged)
      writeCommandAudit(dependencies, {
        command: "set_notification_policy",
        lane: payload.lane,
        status: "success",
        metadataJson: JSON.stringify({
          source: "internal_api",
          changedFields,
        }),
      })

      return reply.code(200).send({ profile: merged })
    } catch (error) {
      if (error instanceof ZodError) {
        writeCommandAudit(dependencies, {
          command: "set_notification_policy",
          lane: null,
          status: "failed",
          errorMessage: "invalid_request",
        })
        return reply.code(400).send({ error: "invalid_request", details: error.issues })
      }

      const err = error as Error
      writeCommandAudit(dependencies, {
        command: "set_notification_policy",
        lane: null,
        status: "failed",
        errorMessage: err.message,
      })
      dependencies.logger.error(
        { error: err.message },
        "Internal API notification profile set failed"
      )
      return reply.code(500).send({ error: "internal_error" })
    }
  })

  app.post("/internal/tools/tasks/audit/list", async (request, reply) => {
    const authorization = request.headers.authorization
    const token = extractBearerToken(authorization)

    if (!token || token !== dependencies.config.token) {
      dependencies.logger.warn(
        { hasAuthorization: Boolean(authorization) },
        "Internal API denied request"
      )
      return reply.code(401).send({ error: "unauthorized" })
    }

    try {
      const payload = listTaskAuditApiSchema.parse(request.body)
      const limit = payload.limit ?? 50
      const taskAudit = dependencies.taskAuditRepository.listRecent(limit)
      const commandAudit = dependencies.commandAuditRepository.listRecent(limit)
      return reply.code(200).send({ taskAudit, commandAudit })
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.code(400).send({ error: "invalid_request", details: error.issues })
      }

      const err = error as Error
      dependencies.logger.error({ error: err.message }, "Internal API task audit list failed")
      return reply.code(500).send({ error: "internal_error" })
    }
  })

  return app
}

/**
 * Starts the internal Fastify API as a loopback service so OpenCode tools can invoke durable
 * Otto actions over a stable local protocol.
 *
 * @param dependencies Internal API configuration and outbound queue persistence dependencies.
 * @returns Running server handle and shutdown function.
 */
export const startInternalApiServer = async (
  dependencies: InternalApiServerDependencies
): Promise<{ url: string; close: () => Promise<void> }> => {
  const app = buildInternalApiServer(dependencies)
  await app.listen({ host: dependencies.config.host, port: dependencies.config.port })

  dependencies.logger.info(
    {
      host: dependencies.config.host,
      port: dependencies.config.port,
      tokenPath: dependencies.config.tokenPath,
    },
    "Internal API started"
  )

  return {
    url: dependencies.config.baseUrl,
    close: async () => {
      await app.close()
      dependencies.logger.info("Internal API stopped")
    },
  }
}
