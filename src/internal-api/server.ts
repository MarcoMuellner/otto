import { randomBytes } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

import Fastify, { type FastifyInstance } from "fastify"
import type { Logger } from "pino"
import { ZodError } from "zod"

import type { OutboundMessageEnqueueRepository } from "../telegram-worker/outbound-enqueue.js"
import { enqueueTelegramMessage } from "../telegram-worker/outbound-enqueue.js"

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
      const result = enqueueTelegramMessage(request.body, dependencies.outboundMessagesRepository)
      dependencies.logger.info(
        {
          route: "queue-telegram-message",
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
