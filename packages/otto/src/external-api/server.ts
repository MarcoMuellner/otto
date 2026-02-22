import { randomUUID } from "node:crypto"

import Fastify, { type FastifyInstance } from "fastify"
import type { Logger } from "pino"
import { z, ZodError } from "zod"

import {
  createTaskMutation,
  deleteTaskMutation,
  runTaskNowMutation,
  taskCreateInputSchema,
  taskDeleteInputSchema,
  TaskMutationError,
  taskUpdateInputSchema,
  updateTaskMutation,
} from "../api-services/tasks-mutations.js"
import {
  getTaskById,
  listTasksForLane,
  mapTaskDetailsForExternal,
  mapTaskListForExternal,
} from "../api-services/tasks-read.js"
import { extractBearerToken } from "../api/http-auth.js"
import { resolveApiTokenPath, resolveOrCreateApiToken } from "../api/token.js"
import type {
  CommandAuditRecord,
  JobRecord,
  JobRunRecord,
  TaskAuditRecord,
  TaskListRecord,
} from "../persistence/repositories.js"
import { getAppVersion } from "../version.js"

const DEFAULT_HOST = "0.0.0.0"
const DEFAULT_PORT = 4190

export type ExternalApiConfig = {
  host: string
  port: number
  token: string
  tokenPath: string
  baseUrl: string
}

export type ExternalSystemServiceStatus = "ok" | "degraded" | "disabled"

export type ExternalSystemStatusResponse = {
  status: "ok" | "degraded"
  checkedAt: number
  runtime: {
    version: string
    pid: number
    startedAt: number
    uptimeSec: number
  }
  services: Array<{
    id: string
    label: string
    status: ExternalSystemServiceStatus
    message: string
  }>
}

export type ExternalSystemRestartResponse = {
  status: "accepted"
  requestedAt: number
  message: string
}

type ExternalApiServerDependencies = {
  logger: Logger
  config: ExternalApiConfig
  systemStatusProvider?: () => ExternalSystemStatusResponse
  restartRuntime?: () => Promise<void>
  jobsRepository: {
    listTasks: () => TaskListRecord[]
    getById: (jobId: string) => JobRecord | null
    listRunsByJobId: (
      jobId: string,
      options?: {
        limit?: number
        offset?: number
      }
    ) => JobRunRecord[]
    countRunsByJobId: (jobId: string) => number
    getRunById: (jobId: string, runId: string) => JobRunRecord | null
    createTask: (record: JobRecord) => void
    updateTask: (
      jobId: string,
      update: {
        type: string
        scheduleType: "recurring" | "oneshot"
        profileId: string | null
        runAt: number | null
        cadenceMinutes: number | null
        payload: string | null
        nextRunAt: number | null
      },
      updatedAt?: number
    ) => void
    cancelTask: (jobId: string, reason: string | null, updatedAt?: number) => void
    runTaskNow: (jobId: string, scheduledFor: number, updatedAt?: number) => void
  }
  taskAuditRepository: {
    listByTaskId: (taskId: string, limit?: number) => TaskAuditRecord[]
    insert: (record: TaskAuditRecord) => void
  }
  commandAuditRepository?: {
    insert: (record: CommandAuditRecord) => void
  }
}

const listJobsQuerySchema = z.object({
  lane: z.literal("scheduled").optional().default("scheduled"),
})

const getJobParamsSchema = z.object({
  id: z.string().trim().min(1),
})

const listAuditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional().default(20),
})

const listRunsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
})

const getRunParamsSchema = z.object({
  id: z.string().trim().min(1),
  runId: z.string().trim().min(1),
})

const mutateJobParamsSchema = z.object({
  id: z.string().trim().min(1),
})

const taskListRecordSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  scheduleType: z.enum(["recurring", "oneshot"]),
  profileId: z.string().min(1).nullable(),
  status: z.enum(["idle", "running", "paused"]),
  runAt: z.number().int().nullable(),
  cadenceMinutes: z.number().int().min(1).nullable(),
  nextRunAt: z.number().int().nullable(),
  terminalState: z.enum(["completed", "expired", "cancelled"]).nullable(),
  terminalReason: z.string().nullable(),
  updatedAt: z.number().int(),
  managedBy: z.enum(["system", "operator"]),
  isMutable: z.boolean(),
})

const jobRecordSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  status: z.enum(["idle", "running", "paused"]),
  scheduleType: z.enum(["recurring", "oneshot"]),
  profileId: z.string().min(1).nullable(),
  runAt: z.number().int().nullable(),
  cadenceMinutes: z.number().int().min(1).nullable(),
  payload: z.string().nullable(),
  lastRunAt: z.number().int().nullable(),
  nextRunAt: z.number().int().nullable(),
  terminalState: z.enum(["completed", "expired", "cancelled"]).nullable(),
  terminalReason: z.string().nullable(),
  lockToken: z.string().nullable(),
  lockExpiresAt: z.number().int().nullable(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  managedBy: z.enum(["system", "operator"]),
  isMutable: z.boolean(),
})

const taskAuditEntrySchema = z.object({
  id: z.string().min(1),
  taskId: z.string().min(1),
  action: z.enum(["create", "update", "delete"]),
  lane: z.enum(["interactive", "scheduled"]),
  actor: z.string().nullable(),
  metadataJson: z.string().nullable(),
  createdAt: z.number().int(),
})

const jobRunEntrySchema = z.object({
  id: z.string().min(1),
  jobId: z.string().min(1),
  scheduledFor: z.number().int().nullable(),
  startedAt: z.number().int(),
  finishedAt: z.number().int().nullable(),
  status: z.enum(["success", "failed", "skipped"]),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  resultJson: z.string().nullable(),
  createdAt: z.number().int(),
})

const healthResponseSchema = z.object({
  status: z.literal("ok"),
})

const listJobsResponseSchema = z.object({
  jobs: z.array(taskListRecordSchema),
})

const jobDetailsResponseSchema = z.object({
  job: jobRecordSchema,
})

const jobAuditResponseSchema = z.object({
  taskId: z.string().min(1),
  entries: z.array(taskAuditEntrySchema),
})

const jobRunsResponseSchema = z.object({
  taskId: z.string().min(1),
  total: z.number().int().min(0),
  limit: z.number().int().min(1).max(200),
  offset: z.number().int().min(0),
  runs: z.array(jobRunEntrySchema),
})

const jobRunDetailResponseSchema = z.object({
  taskId: z.string().min(1),
  run: jobRunEntrySchema,
})

const taskMutationResponseSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["created", "updated", "deleted", "run_now_scheduled"]),
  scheduledFor: z.number().int().optional(),
})

const serviceStatusSchema = z.enum(["ok", "degraded", "disabled"])

const systemServiceSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1),
  status: serviceStatusSchema,
  message: z.string().trim().min(1),
})

const systemStatusResponseSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  checkedAt: z.number().int(),
  runtime: z.object({
    version: z.string().trim().min(1),
    pid: z.number().int().min(1),
    startedAt: z.number().int(),
    uptimeSec: z.number().min(0),
  }),
  services: z.array(systemServiceSchema),
})

const systemRestartResponseSchema = z.object({
  status: z.literal("accepted"),
  requestedAt: z.number().int(),
  message: z.string().trim().min(1),
})

const resolveApiHost = (environment: NodeJS.ProcessEnv): string => {
  const host = environment.OTTO_EXTERNAL_API_HOST?.trim() || DEFAULT_HOST

  if (host.length === 0) {
    throw new Error("Invalid external API config: OTTO_EXTERNAL_API_HOST must be non-empty")
  }

  return host
}

const resolveApiPort = (environment: NodeJS.ProcessEnv): number => {
  const rawPort = environment.OTTO_EXTERNAL_API_PORT
  const port = rawPort ? Number(rawPort) : DEFAULT_PORT

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Invalid external API config: OTTO_EXTERNAL_API_PORT must be 1-65535")
  }

  return port
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

/**
 * Resolves external API network settings and shared auth token so Otto can expose a
 * stable LAN-facing control plane contract without splitting credential management.
 *
 * @param ottoHome Otto home directory containing the shared API token file.
 * @param environment Optional environment override for tests.
 * @returns External API runtime configuration with shared persisted token.
 */
export const resolveExternalApiConfig = async (
  ottoHome: string,
  environment: NodeJS.ProcessEnv = process.env
): Promise<ExternalApiConfig> => {
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
 * Builds a runtime-owned system status snapshot from process metadata and service-level
 * health markers so operators can inspect actionable runtime truth through one contract.
 *
 * @param input Runtime and service status values known by the current process.
 * @returns External system status payload suitable for `/external/system/status`.
 */
export const buildExternalSystemStatusSnapshot = (input: {
  startedAt: number
  services: ExternalSystemStatusResponse["services"]
}): ExternalSystemStatusResponse => {
  const hasDegradedService = input.services.some((service) => service.status === "degraded")

  return {
    status: hasDegradedService ? "degraded" : "ok",
    checkedAt: Date.now(),
    runtime: {
      version: getAppVersion(),
      pid: process.pid,
      startedAt: input.startedAt,
      uptimeSec: Number(process.uptime().toFixed(3)),
    },
    services: input.services,
  }
}

/**
 * Builds the LAN-facing external API server used by the control-plane process and future
 * non-OpenCode clients while preserving Otto runtime ownership of source-of-truth data.
 *
 * @param dependencies External API configuration, logger, and persistence dependencies.
 * @returns Fastify instance ready for injection tests or network listen.
 */
export const buildExternalApiServer = (
  dependencies: ExternalApiServerDependencies
): FastifyInstance => {
  const app = Fastify({ logger: false })
  const commandAuditRepository = dependencies.commandAuditRepository
  const systemStatusProvider =
    dependencies.systemStatusProvider ??
    (() => {
      return buildExternalSystemStatusSnapshot({
        startedAt: Date.now(),
        services: [
          {
            id: "runtime",
            label: "Otto Runtime",
            status: "ok",
            message: "Runtime process is active",
          },
        ],
      })
    })
  const restartRuntime = dependencies.restartRuntime ?? (async () => undefined)

  app.addHook("onRequest", async (request, reply) => {
    const token = extractBearerToken(request.headers.authorization)
    if (!token || token !== dependencies.config.token) {
      dependencies.logger.warn(
        {
          route: request.url,
          hasAuthorization: Boolean(request.headers.authorization),
        },
        "External API denied request"
      )
      return reply.code(401).send({ error: "unauthorized" })
    }
  })

  app.get("/external/health", async (_request, reply) => {
    return reply.code(200).send(healthResponseSchema.parse({ status: "ok" }))
  })

  app.get("/external/system/status", async (_request, reply) => {
    try {
      const snapshot = systemStatusResponseSchema.parse(systemStatusProvider())
      return reply.code(200).send(snapshot)
    } catch (error) {
      const err = error as Error
      dependencies.logger.error({ error: err.message }, "External API system status failed")
      return reply.code(500).send({ error: "internal_error" })
    }
  })

  app.post("/external/system/restart", async (_request, reply) => {
    try {
      const requestedAt = Date.now()
      await restartRuntime()

      commandAuditRepository?.insert({
        id: randomUUID(),
        command: "external_system_restart",
        lane: "interactive",
        status: "success",
        errorMessage: null,
        metadataJson: JSON.stringify({ source: "external_api", requestedAt }),
        createdAt: requestedAt,
      })

      return reply.code(202).send(
        systemRestartResponseSchema.parse({
          status: "accepted",
          requestedAt,
          message: "Runtime restart requested",
        })
      )
    } catch (error) {
      const err = error as Error
      commandAuditRepository?.insert({
        id: randomUUID(),
        command: "external_system_restart",
        lane: "interactive",
        status: "failed",
        errorMessage: err.message,
        metadataJson: JSON.stringify({ source: "external_api" }),
        createdAt: Date.now(),
      })
      dependencies.logger.error({ error: err.message }, "External API runtime restart failed")
      return reply.code(500).send({ error: "internal_error" })
    }
  })

  app.get("/external/jobs", async (request, reply) => {
    try {
      const query = listJobsQuerySchema.parse(request.query)
      const jobs = listTasksForLane(dependencies.jobsRepository, query.lane).map(
        mapTaskListForExternal
      )

      return reply.code(200).send(
        listJobsResponseSchema.parse({
          jobs,
        })
      )
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.code(400).send({ error: "invalid_request", details: error.issues })
      }

      const err = error as Error
      dependencies.logger.error({ error: err.message }, "External API job list failed")
      return reply.code(500).send({ error: "internal_error" })
    }
  })

  app.post("/external/jobs", async (request, reply) => {
    try {
      const payload = taskCreateInputSchema.parse(request.body)
      const mutation = createTaskMutation(
        {
          jobsRepository: dependencies.jobsRepository,
          taskAuditRepository: dependencies.taskAuditRepository,
        },
        payload,
        {
          lane: "scheduled",
          actor: "control_plane",
          source: "external_api",
        }
      )

      return reply.code(201).send(taskMutationResponseSchema.parse(mutation))
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.code(400).send({ error: "invalid_request", details: error.issues })
      }

      if (error instanceof TaskMutationError) {
        const failure = resolveTaskMutationErrorResponse(error)
        return reply.code(failure.statusCode).send(failure.body)
      }

      const err = error as Error
      dependencies.logger.error({ error: err.message }, "External API job create failed")
      return reply.code(500).send({ error: "internal_error" })
    }
  })

  app.patch("/external/jobs/:id", async (request, reply) => {
    try {
      const params = mutateJobParamsSchema.parse(request.params)
      const payload = taskUpdateInputSchema.parse(request.body)

      const mutation = updateTaskMutation(
        {
          jobsRepository: dependencies.jobsRepository,
          taskAuditRepository: dependencies.taskAuditRepository,
        },
        params.id,
        payload,
        {
          lane: "scheduled",
          actor: "control_plane",
          source: "external_api",
        }
      )

      return reply.code(200).send(taskMutationResponseSchema.parse(mutation))
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.code(400).send({ error: "invalid_request", details: error.issues })
      }

      if (error instanceof TaskMutationError) {
        const failure = resolveTaskMutationErrorResponse(error)
        return reply.code(failure.statusCode).send(failure.body)
      }

      const err = error as Error
      dependencies.logger.error({ error: err.message }, "External API job update failed")
      return reply.code(500).send({ error: "internal_error" })
    }
  })

  app.delete("/external/jobs/:id", async (request, reply) => {
    try {
      const params = mutateJobParamsSchema.parse(request.params)
      const payload = taskDeleteInputSchema.parse(request.body ?? {})

      const mutation = deleteTaskMutation(
        {
          jobsRepository: dependencies.jobsRepository,
          taskAuditRepository: dependencies.taskAuditRepository,
        },
        params.id,
        payload,
        {
          lane: "scheduled",
          actor: "control_plane",
          source: "external_api",
        }
      )

      return reply.code(200).send(taskMutationResponseSchema.parse(mutation))
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.code(400).send({ error: "invalid_request", details: error.issues })
      }

      if (error instanceof TaskMutationError) {
        const failure = resolveTaskMutationErrorResponse(error)
        return reply.code(failure.statusCode).send(failure.body)
      }

      const err = error as Error
      dependencies.logger.error({ error: err.message }, "External API job delete failed")
      return reply.code(500).send({ error: "internal_error" })
    }
  })

  app.post("/external/jobs/:id/run-now", async (request, reply) => {
    try {
      const params = mutateJobParamsSchema.parse(request.params)
      const mutation = runTaskNowMutation(
        {
          jobsRepository: dependencies.jobsRepository,
          taskAuditRepository: dependencies.taskAuditRepository,
        },
        params.id,
        {
          lane: "scheduled",
          actor: "control_plane",
          source: "external_api",
        }
      )

      return reply.code(200).send(taskMutationResponseSchema.parse(mutation))
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.code(400).send({ error: "invalid_request", details: error.issues })
      }

      if (error instanceof TaskMutationError) {
        const failure = resolveTaskMutationErrorResponse(error)
        return reply.code(failure.statusCode).send(failure.body)
      }

      const err = error as Error
      dependencies.logger.error({ error: err.message }, "External API job run-now failed")
      return reply.code(500).send({ error: "internal_error" })
    }
  })

  app.get("/external/jobs/:id", async (request, reply) => {
    try {
      const params = getJobParamsSchema.parse(request.params)
      const job = getTaskById(dependencies.jobsRepository, params.id)

      if (!job) {
        return reply.code(404).send({ error: "not_found", message: "Task not found" })
      }

      return reply
        .code(200)
        .send(jobDetailsResponseSchema.parse({ job: mapTaskDetailsForExternal(job) }))
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.code(400).send({ error: "invalid_request", details: error.issues })
      }

      const err = error as Error
      dependencies.logger.error({ error: err.message }, "External API job detail failed")
      return reply.code(500).send({ error: "internal_error" })
    }
  })

  app.get("/external/jobs/:id/audit", async (request, reply) => {
    try {
      const params = getJobParamsSchema.parse(request.params)
      const query = listAuditQuerySchema.parse(request.query)
      const job = getTaskById(dependencies.jobsRepository, params.id)

      if (!job) {
        return reply.code(404).send({ error: "not_found", message: "Task not found" })
      }

      const entries = dependencies.taskAuditRepository
        .listByTaskId(params.id, query.limit)
        .map((entry) => ({
          id: entry.id,
          taskId: entry.taskId,
          action: entry.action,
          lane: entry.lane,
          actor: entry.actor,
          metadataJson: entry.metadataJson,
          createdAt: entry.createdAt,
        }))

      return reply.code(200).send(
        jobAuditResponseSchema.parse({
          taskId: params.id,
          entries,
        })
      )
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.code(400).send({ error: "invalid_request", details: error.issues })
      }

      const err = error as Error
      dependencies.logger.error({ error: err.message }, "External API job audit failed")
      return reply.code(500).send({ error: "internal_error" })
    }
  })

  app.get("/external/jobs/:id/runs", async (request, reply) => {
    try {
      const params = getJobParamsSchema.parse(request.params)
      const query = listRunsQuerySchema.parse(request.query)
      const job = getTaskById(dependencies.jobsRepository, params.id)

      if (!job) {
        return reply.code(404).send({ error: "not_found", message: "Task not found" })
      }

      const runs = dependencies.jobsRepository.listRunsByJobId(params.id, {
        limit: query.limit,
        offset: query.offset,
      })
      const total = dependencies.jobsRepository.countRunsByJobId(params.id)

      return reply.code(200).send(
        jobRunsResponseSchema.parse({
          taskId: params.id,
          total,
          limit: query.limit,
          offset: query.offset,
          runs,
        })
      )
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.code(400).send({ error: "invalid_request", details: error.issues })
      }

      const err = error as Error
      dependencies.logger.error({ error: err.message }, "External API job runs failed")
      return reply.code(500).send({ error: "internal_error" })
    }
  })

  app.get("/external/jobs/:id/runs/:runId", async (request, reply) => {
    try {
      const params = getRunParamsSchema.parse(request.params)
      const job = getTaskById(dependencies.jobsRepository, params.id)

      if (!job) {
        return reply.code(404).send({ error: "not_found", message: "Task not found" })
      }

      const run = dependencies.jobsRepository.getRunById(params.id, params.runId)
      if (!run) {
        return reply.code(404).send({ error: "not_found", message: "Run not found" })
      }

      return reply.code(200).send(
        jobRunDetailResponseSchema.parse({
          taskId: params.id,
          run,
        })
      )
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.code(400).send({ error: "invalid_request", details: error.issues })
      }

      const err = error as Error
      dependencies.logger.error({ error: err.message }, "External API job run detail failed")
      return reply.code(500).send({ error: "internal_error" })
    }
  })

  return app
}

/**
 * Starts the external Fastify API as a LAN-accessible service so the separate control-plane
 * process can read Otto runtime state through authenticated HTTP contracts.
 *
 * @param dependencies External API configuration and persistence dependencies.
 * @returns Running server handle and shutdown function.
 */
export const startExternalApiServer = async (
  dependencies: ExternalApiServerDependencies
): Promise<{ url: string; close: () => Promise<void> }> => {
  const app = buildExternalApiServer(dependencies)
  await app.listen({ host: dependencies.config.host, port: dependencies.config.port })

  dependencies.logger.info(
    {
      host: dependencies.config.host,
      port: dependencies.config.port,
      tokenPath: dependencies.config.tokenPath,
    },
    "External API started"
  )

  return {
    url: dependencies.config.baseUrl,
    close: async () => {
      await app.close()
      dependencies.logger.info("External API stopped")
    },
  }
}
