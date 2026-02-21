import Fastify, { type FastifyInstance } from "fastify"
import type { Logger } from "pino"
import { z, ZodError } from "zod"

import { getTaskById, listTasksForLane } from "../api-services/tasks-read.js"
import { extractBearerToken } from "../api/http-auth.js"
import { resolveApiTokenPath, resolveOrCreateApiToken } from "../api/token.js"
import type { JobRecord, TaskListRecord } from "../persistence/repositories.js"

const DEFAULT_HOST = "0.0.0.0"
const DEFAULT_PORT = 4190

export type ExternalApiConfig = {
  host: string
  port: number
  token: string
  tokenPath: string
  baseUrl: string
}

type ExternalApiServerDependencies = {
  logger: Logger
  config: ExternalApiConfig
  jobsRepository: {
    listTasks: () => TaskListRecord[]
    getById: (jobId: string) => JobRecord | null
  }
}

const getJobParamsSchema = z.object({
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

  app.get("/external/jobs", async (request, reply) => {
    try {
      void request
      const jobs = listTasksForLane(dependencies.jobsRepository, "scheduled")

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

  app.get("/external/jobs/:id", async (request, reply) => {
    try {
      const params = getJobParamsSchema.parse(request.params)
      const job = getTaskById(dependencies.jobsRepository, params.id)

      if (!job) {
        return reply.code(404).send({ error: "not_found", message: "Task not found" })
      }

      return reply.code(200).send(jobDetailsResponseSchema.parse({ job }))
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.code(400).send({ error: "invalid_request", details: error.issues })
      }

      const err = error as Error
      dependencies.logger.error({ error: err.message }, "External API job detail failed")
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
