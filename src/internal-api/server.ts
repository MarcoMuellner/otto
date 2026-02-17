import { randomBytes, randomUUID } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

import Fastify, { type FastifyInstance } from "fastify"
import type { Logger } from "pino"
import { z, ZodError } from "zod"

import type { OutboundMessageEnqueueRepository } from "../telegram-worker/outbound-enqueue.js"
import { enqueueTelegramMessage } from "../telegram-worker/outbound-enqueue.js"
import type { JobRecord, JobScheduleType, TaskListRecord } from "../persistence/repositories.js"

const DEFAULT_HOST = "127.0.0.1"
const DEFAULT_PORT = 4180
const TOKEN_FILE_NAME = "internal-api.token"
const AUTHORIZATION_PREFIX = "Bearer "

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
        runAt: number | null
        cadenceMinutes: number | null
        payload: string | null
        nextRunAt: number | null
      },
      updatedAt?: number
    ) => void
    cancelTask: (jobId: string, reason: string | null, updatedAt?: number) => void
    listTasks: () => TaskListRecord[]
  }
}

const queueTelegramMessageApiSchema = z.object({
  sessionId: z.string().trim().min(1).optional(),
  chatId: z.number().int().optional(),
  content: z.string().trim().min(1),
  dedupeKey: z.string().trim().min(1).max(512).optional(),
  priority: z.enum(["low", "normal", "high"]).optional(),
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

const resolveTokenPath = (ottoHome: string): string => {
  return path.join(ottoHome, "secrets", TOKEN_FILE_NAME)
}

const generateToken = (): string => {
  return randomBytes(32).toString("hex")
}

const resolveOrCreateToken = async (tokenPath: string): Promise<string> => {
  try {
    const existing = await readFile(tokenPath, "utf8")
    const token = existing.trim()
    if (token.length > 0) {
      return token
    }
  } catch (error) {
    const err = error as NodeJS.ErrnoException
    if (err.code !== "ENOENT") {
      throw error
    }
  }

  const token = generateToken()
  await mkdir(path.dirname(tokenPath), { recursive: true })
  await writeFile(tokenPath, `${token}\n`, { encoding: "utf8", mode: 0o600 })

  return token
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
  const tokenPath = resolveTokenPath(ottoHome)
  const token = await resolveOrCreateToken(tokenPath)

  return {
    host,
    port,
    token,
    tokenPath,
    baseUrl: `http://${host}:${port}`,
  }
}

const extractBearerToken = (authorizationHeader: string | undefined): string | null => {
  if (!authorizationHeader?.startsWith(AUTHORIZATION_PREFIX)) {
    return null
  }

  const token = authorizationHeader.slice(AUTHORIZATION_PREFIX.length).trim()
  return token.length > 0 ? token : null
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
          : null)

      if (!resolvedChatId) {
        return reply.code(400).send({
          error: "missing_chat",
          message: "chatId is required unless sessionId is mapped to a Telegram chat binding",
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
      return reply.code(200).send(result)
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.code(400).send({ error: "invalid_request", details: error.issues })
      }

      const err = error as Error
      dependencies.logger.error({ error: err.message }, "Internal API request failed")
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
        return reply.code(laneDecision.statusCode).send(laneDecision.body)
      }

      const now = Date.now()
      const id = payload.id ?? randomUUID()
      const runAt = payload.runAt ?? now
      const nextRunAt = runAt

      dependencies.jobsRepository.createTask({
        id,
        type: payload.type,
        status: "idle",
        scheduleType: payload.scheduleType,
        profileId: payload.profileId ?? null,
        runAt,
        cadenceMinutes:
          payload.scheduleType === "recurring" ? (payload.cadenceMinutes ?? null) : null,
        payload: payload.payload ? JSON.stringify(payload.payload) : null,
        lastRunAt: null,
        nextRunAt,
        terminalState: null,
        terminalReason: null,
        lockToken: null,
        lockExpiresAt: null,
        createdAt: now,
        updatedAt: now,
      })

      return reply.code(200).send({
        id,
        status: "created",
      })
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.code(400).send({ error: "invalid_request", details: error.issues })
      }

      const err = error as Error
      dependencies.logger.error({ error: err.message }, "Internal API task create failed")
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
        return reply.code(laneDecision.statusCode).send(laneDecision.body)
      }

      const existingTask = dependencies.jobsRepository.getById(payload.id)
      if (!existingTask) {
        return reply.code(404).send({ error: "not_found", message: "Task not found" })
      }

      const scheduleType = payload.scheduleType ?? existingTask.scheduleType
      const runAt = payload.runAt === undefined ? existingTask.runAt : payload.runAt
      const cadenceMinutes =
        payload.cadenceMinutes === undefined ? existingTask.cadenceMinutes : payload.cadenceMinutes

      dependencies.jobsRepository.updateTask(
        payload.id,
        {
          type: payload.type ?? existingTask.type,
          scheduleType,
          profileId: payload.profileId === undefined ? existingTask.profileId : payload.profileId,
          runAt,
          cadenceMinutes,
          payload:
            payload.payload === undefined
              ? existingTask.payload
              : payload.payload === null
                ? null
                : JSON.stringify(payload.payload),
          nextRunAt: runAt,
        },
        Date.now()
      )

      return reply.code(200).send({
        id: payload.id,
        status: "updated",
      })
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.code(400).send({ error: "invalid_request", details: error.issues })
      }

      const err = error as Error
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
        return reply.code(laneDecision.statusCode).send(laneDecision.body)
      }

      const existingTask = dependencies.jobsRepository.getById(payload.id)
      if (!existingTask) {
        return reply.code(404).send({ error: "not_found", message: "Task not found" })
      }

      dependencies.jobsRepository.cancelTask(payload.id, payload.reason ?? null, Date.now())
      return reply.code(200).send({ id: payload.id, status: "deleted" })
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.code(400).send({ error: "invalid_request", details: error.issues })
      }

      const err = error as Error
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
      listTasksApiSchema.parse(request.body)
      const tasks = dependencies.jobsRepository.listTasks()
      return reply.code(200).send({ tasks })
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.code(400).send({ error: "invalid_request", details: error.issues })
      }

      const err = error as Error
      dependencies.logger.error({ error: err.message }, "Internal API task list failed")
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
