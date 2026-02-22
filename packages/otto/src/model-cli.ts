import { request as requestHttp } from "node:http"
import { request as requestHttps } from "node:https"
import { readFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { z } from "zod"

import {
  externalModelCatalogResponseSchema,
  externalModelDefaultsResponseSchema,
  externalModelRefreshResponseSchema,
  modelRefSchema,
  runtimeModelFlowSchema,
} from "./model-management/contracts.js"

type CliStreams = {
  stdout: Pick<Console, "log">
  stderr: Pick<Console, "error">
}

type ModelCliEnvironment = NodeJS.ProcessEnv

type FetchLike = typeof fetch

type ModelCliContext = {
  baseUrl: string
  token: string
  fetchImpl: FetchLike
}

type HttpResponseSnapshot = {
  statusCode: number
  bodyText: string
}

const updateTaskModelResponseSchema = z.object({
  id: z.string().trim().min(1),
  status: z.enum(["created", "updated", "deleted", "run_now_scheduled"]),
})

const defaultsFlowOrder = [
  "interactiveAssistant",
  "scheduledTasks",
  "heartbeat",
  "watchdogFailures",
] as const

const usage = `Usage: model-cli <command> [options]

Commands:
  model list
  model refresh
  model defaults show
  model defaults set <flow> <provider/model|inherit>
  task set-model <task-id> <provider/model|inherit>
`

const normalizeExternalApiBaseUrl = (baseUrl: string): string => {
  try {
    const parsed = new URL(baseUrl)
    if (parsed.hostname === "0.0.0.0") {
      parsed.hostname = "127.0.0.1"
    }

    return parsed.toString().replace(/\/$/, "")
  } catch {
    return baseUrl
  }
}

const resolveExternalApiBaseUrl = (environment: ModelCliEnvironment): string => {
  const explicitBaseUrl = environment.OTTO_EXTERNAL_API_URL?.trim()
  if (explicitBaseUrl) {
    return normalizeExternalApiBaseUrl(explicitBaseUrl)
  }

  const rawHost = environment.OTTO_EXTERNAL_API_HOST?.trim()
  const host = !rawHost || rawHost === "0.0.0.0" ? "127.0.0.1" : rawHost
  const port = environment.OTTO_EXTERNAL_API_PORT?.trim() || "4190"
  return normalizeExternalApiBaseUrl(`http://${host}:${port}`)
}

const resolveExternalApiToken = async (
  environment: ModelCliEnvironment,
  ottoHome: string
): Promise<string> => {
  const explicitToken = environment.OTTO_EXTERNAL_API_TOKEN?.trim()
  if (explicitToken) {
    return explicitToken
  }

  const tokenPath =
    environment.OTTO_EXTERNAL_API_TOKEN_FILE?.trim() ||
    path.join(ottoHome, "secrets", "internal-api.token")

  const source = await readFile(tokenPath, "utf8")
  const token = source.trim()
  if (token.length === 0) {
    throw new Error(`Otto external API token file is empty: ${tokenPath}`)
  }

  return token
}

const requestExternalApiViaNodeHttp = async (
  context: ModelCliContext,
  endpoint: string,
  options: {
    method: "GET" | "POST" | "PUT" | "PATCH"
    bodyText?: string
  }
): Promise<HttpResponseSnapshot> => {
  const target = new URL(endpoint, context.baseUrl)
  const requestImpl = target.protocol === "https:" ? requestHttps : requestHttp
  const requestBody = options.bodyText ?? ""

  return await new Promise((resolve, reject) => {
    const request = requestImpl(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port,
        path: `${target.pathname}${target.search}`,
        method: options.method,
        headers: {
          authorization: `Bearer ${context.token}`,
          ...(requestBody.length > 0
            ? {
                "content-type": "application/json",
                "content-length": Buffer.byteLength(requestBody),
              }
            : {}),
        },
      },
      (response) => {
        const chunks: Buffer[] = []
        response.on("data", (chunk: Buffer) => {
          chunks.push(chunk)
        })
        response.on("end", () => {
          resolve({
            statusCode: response.statusCode ?? 500,
            bodyText: Buffer.concat(chunks).toString("utf8"),
          })
        })
      }
    )

    request.on("error", reject)
    if (requestBody.length > 0) {
      request.write(requestBody)
    }
    request.end()
  })
}

const requestExternalApi = async <T>(
  context: ModelCliContext,
  endpoint: string,
  schema: z.ZodType<T>,
  options?: {
    method?: "GET" | "POST" | "PUT" | "PATCH"
    body?: unknown
  }
): Promise<T> => {
  const method = options?.method ?? "GET"
  const hasBody = options?.body !== undefined
  const requestBodyText = hasBody ? JSON.stringify(options?.body) : undefined
  let statusCode = 500
  let text = ""

  try {
    const response = await context.fetchImpl(new URL(endpoint, context.baseUrl), {
      method,
      headers: {
        authorization: `Bearer ${context.token}`,
        ...(hasBody
          ? {
              "content-type": "application/json",
            }
          : {}),
      },
      body: requestBodyText,
    })

    statusCode = response.status
    text = await response.text()
  } catch (error) {
    const err = error as Error & { cause?: { message?: string } }

    if (err.cause?.message?.includes("bad port")) {
      try {
        const fallback = await requestExternalApiViaNodeHttp(context, endpoint, {
          method,
          bodyText: requestBodyText,
        })
        statusCode = fallback.statusCode
        text = fallback.bodyText
      } catch (fallbackError) {
        const fallbackErr = fallbackError as Error
        throw new Error(
          `Cannot reach Otto external API at ${context.baseUrl} (${fallbackErr.message}). ` +
            `Ensure otto serve is running and the URL/token are correct.`
        )
      }
    } else {
      throw new Error(
        `Cannot reach Otto external API at ${context.baseUrl} (${err.message}). ` +
          `Ensure otto serve is running and the URL/token are correct.`
      )
    }
  }

  let body: unknown = {}
  if (text.length > 0) {
    try {
      body = JSON.parse(text)
    } catch {
      throw new Error(`Otto external API returned non-JSON payload for ${endpoint}`)
    }
  }

  if (statusCode < 200 || statusCode >= 300) {
    const parsedError = z
      .object({
        error: z.string().optional(),
        message: z.string().optional(),
      })
      .safeParse(body)

    const suffix = parsedError.success
      ? (parsedError.data.message ?? parsedError.data.error ?? "request failed")
      : "request failed"

    throw new Error(`Otto external API ${method} ${endpoint} failed (${statusCode}): ${suffix}`)
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    throw new Error(`Otto external API returned invalid payload for ${method} ${endpoint}`)
  }

  return parsed.data
}

const printFlowDefaults = (
  flowDefaults: z.infer<typeof externalModelDefaultsResponseSchema>["flowDefaults"],
  streams: CliStreams
): void => {
  for (const flow of defaultsFlowOrder) {
    const value = flowDefaults[flow]
    streams.stdout.log(`${flow}\t${value ?? "inherit"}`)
  }
}

const runModelCommand = async (
  args: string[],
  context: ModelCliContext,
  streams: CliStreams
): Promise<void> => {
  const [subcommand, ...rest] = args

  if (subcommand === "list") {
    if (rest.length > 0) {
      throw new Error("Usage: model-cli model list")
    }

    const payload = await requestExternalApi(
      context,
      "/external/models/catalog",
      externalModelCatalogResponseSchema
    )

    streams.stdout.log(`source\t${payload.source}`)
    streams.stdout.log(`updatedAt\t${payload.updatedAt ?? ""}`)
    streams.stdout.log("model")
    for (const model of payload.models) {
      streams.stdout.log(model)
    }
    return
  }

  if (subcommand === "refresh") {
    if (rest.length > 0) {
      throw new Error("Usage: model-cli model refresh")
    }

    const payload = await requestExternalApi(
      context,
      "/external/models/refresh",
      externalModelRefreshResponseSchema,
      {
        method: "POST",
      }
    )

    streams.stdout.log(`status\t${payload.status}`)
    streams.stdout.log(`updatedAt\t${payload.updatedAt}`)
    streams.stdout.log(`count\t${payload.count}`)
    return
  }

  if (subcommand === "defaults") {
    const [defaultsAction, ...defaultsArgs] = rest

    if (defaultsAction === "show") {
      if (defaultsArgs.length > 0) {
        throw new Error("Usage: model-cli model defaults show")
      }

      const payload = await requestExternalApi(
        context,
        "/external/models/defaults",
        externalModelDefaultsResponseSchema
      )
      printFlowDefaults(payload.flowDefaults, streams)
      return
    }

    if (defaultsAction === "set") {
      const [flowInput, modelRefInput, ...remaining] = defaultsArgs
      if (!flowInput || !modelRefInput || remaining.length > 0) {
        throw new Error("Usage: model-cli model defaults set <flow> <provider/model|inherit>")
      }

      const flow = runtimeModelFlowSchema.parse(flowInput)
      const modelRef = modelRefInput === "inherit" ? null : modelRefSchema.parse(modelRefInput)

      const existingDefaults = await requestExternalApi(
        context,
        "/external/models/defaults",
        externalModelDefaultsResponseSchema
      )

      const updatedDefaults = {
        ...existingDefaults.flowDefaults,
        [flow]: modelRef,
      }

      const payload = await requestExternalApi(
        context,
        "/external/models/defaults",
        externalModelDefaultsResponseSchema,
        {
          method: "PUT",
          body: {
            flowDefaults: updatedDefaults,
          },
        }
      )

      printFlowDefaults(payload.flowDefaults, streams)
      return
    }

    throw new Error(`Unknown model defaults command: ${defaultsAction ?? ""}`)
  }

  throw new Error(`Unknown model command: ${subcommand ?? ""}`)
}

const runTaskCommand = async (
  args: string[],
  context: ModelCliContext,
  streams: CliStreams
): Promise<void> => {
  const [subcommand, ...rest] = args
  if (subcommand !== "set-model") {
    throw new Error(`Unknown task command: ${subcommand ?? ""}`)
  }

  const [taskId, modelInput, ...remaining] = rest
  if (!taskId || !modelInput || remaining.length > 0) {
    throw new Error("Usage: model-cli task set-model <task-id> <provider/model|inherit>")
  }

  const normalizedTaskId = taskId.trim()
  if (normalizedTaskId.length === 0) {
    throw new Error("task-id must be a non-empty string")
  }

  const modelRef = modelInput === "inherit" ? null : modelRefSchema.parse(modelInput)

  const payload = await requestExternalApi(
    context,
    `/external/jobs/${encodeURIComponent(normalizedTaskId)}`,
    updateTaskModelResponseSchema,
    {
      method: "PATCH",
      body: {
        modelRef,
      },
    }
  )

  streams.stdout.log(`id\t${payload.id}`)
  streams.stdout.log(`status\t${payload.status}`)
  streams.stdout.log(`modelRef\t${modelRef ?? "inherit"}`)
}

/**
 * Runs model and per-task model operator commands against Otto external API with shared
 * validation so bash entrypoints stay thin and contract behavior remains testable.
 */
export const runModelCliCommand = async (
  args: string[],
  streams: CliStreams = { stdout: console, stderr: console },
  environment: ModelCliEnvironment = process.env,
  fetchImpl: FetchLike = fetch
): Promise<number> => {
  try {
    const [scope, ...rest] = args
    if (!scope || scope === "help" || scope === "--help" || scope === "-h") {
      streams.stdout.log(usage)
      return 0
    }

    const ottoHome = environment.OTTO_HOME ?? path.join(os.homedir(), ".otto")
    const context: ModelCliContext = {
      baseUrl: resolveExternalApiBaseUrl(environment),
      token: await resolveExternalApiToken(environment, ottoHome),
      fetchImpl,
    }

    if (scope === "model") {
      await runModelCommand(rest, context, streams)
      return 0
    }

    if (scope === "task") {
      await runTaskCommand(rest, context, streams)
      return 0
    }

    if (scope === "list" || scope === "refresh" || scope === "defaults") {
      await runModelCommand([scope, ...rest], context, streams)
      return 0
    }

    throw new Error(`Unknown model-cli command: ${scope}`)
  } catch (error) {
    const err = error as Error
    streams.stderr.error(err.message)
    return 1
  }
}

const isMainModule =
  typeof process.argv[1] === "string" &&
  (process.argv[1].endsWith("/model-cli.mjs") || process.argv[1].endsWith("\\model-cli.mjs"))

if (isMainModule) {
  runModelCliCommand(process.argv.slice(2))
    .then((exitCode) => {
      process.exitCode = exitCode
    })
    .catch((error) => {
      const err = error as Error
      console.error(err.message)
      process.exitCode = 1
    })
}
