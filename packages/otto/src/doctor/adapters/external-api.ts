import http from "node:http"
import https from "node:https"
import { readFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { z } from "zod"

type DoctorExternalApiEnvironment = NodeJS.ProcessEnv

type DoctorExternalApiContext = {
  baseUrl: string
  token: string
}

const RETRY_ATTEMPTS = 3
const RETRY_DELAY_MS = 150

const taskMutationResultSchema = z.object({
  id: z.string().trim().min(1),
  status: z.enum(["created", "updated", "deleted", "run_now_scheduled"]),
  scheduledFor: z.number().int().optional(),
})

const jobRecordSchema = z.object({
  id: z.string().trim().min(1),
  type: z.string().trim().min(1),
  status: z.enum(["idle", "running", "paused"]),
  scheduleType: z.enum(["recurring", "oneshot"]),
  runAt: z.number().int().nullable(),
  nextRunAt: z.number().int().nullable(),
  terminalState: z.enum(["completed", "expired", "cancelled"]).nullable(),
  terminalReason: z.string().nullable(),
  updatedAt: z.number().int(),
})

const jobDetailsResponseSchema = z.object({
  job: jobRecordSchema,
})

const jobRunRecordSchema = z.object({
  id: z.string().trim().min(1),
  jobId: z.string().trim().min(1),
  startedAt: z.number().int(),
  finishedAt: z.number().int().nullable(),
  status: z.enum(["success", "failed", "skipped"]),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.number().int(),
})

const jobRunsResponseSchema = z.object({
  taskId: z.string().trim().min(1),
  total: z.number().int().min(0),
  limit: z.number().int().min(1).max(200),
  offset: z.number().int().min(0),
  runs: z.array(jobRunRecordSchema),
})

const backgroundCancelResponseSchema = z.object({
  jobId: z.string().trim().min(1),
  outcome: z.enum(["cancelled", "already_cancelled", "already_terminal"]),
  terminalState: z.enum(["completed", "expired", "cancelled"]),
})

const externalApiErrorResponseSchema = z.object({
  error: z.string().trim().min(1),
  message: z.string().trim().min(1).optional(),
})

export type DoctorExternalJobRecord = z.infer<typeof jobRecordSchema>
export type DoctorExternalJobRunRecord = z.infer<typeof jobRunRecordSchema>
export type DoctorExternalTaskMutationResult = z.infer<typeof taskMutationResultSchema>
export type DoctorExternalBackgroundCancelResult = z.infer<typeof backgroundCancelResponseSchema>

export class DoctorExternalApiError extends Error {
  code: string
  statusCode: number
  method: string
  endpoint: string

  constructor(input: {
    code: string
    message: string
    statusCode: number
    method: string
    endpoint: string
  }) {
    super(input.message)
    this.name = "DoctorExternalApiError"
    this.code = input.code
    this.statusCode = input.statusCode
    this.method = input.method
    this.endpoint = input.endpoint
  }
}

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

const resolveExternalApiBaseUrl = (environment: DoctorExternalApiEnvironment): string => {
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
  environment: DoctorExternalApiEnvironment,
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

export const resolveDoctorExternalApiContext = async (
  environment: DoctorExternalApiEnvironment = process.env
): Promise<DoctorExternalApiContext> => {
  const ottoHome = environment.OTTO_HOME ?? path.join(os.homedir(), ".otto")
  const baseUrl = resolveExternalApiBaseUrl(environment)
  const token = await resolveExternalApiToken(environment, ottoHome)

  return {
    baseUrl,
    token,
  }
}

const parseErrorMessage = async (
  response: Response
): Promise<{ code: string; message: string }> => {
  try {
    const payload = externalApiErrorResponseSchema.parse(await response.json())
    return {
      code: payload.error,
      message: payload.message ?? `External API request failed with status ${response.status}`,
    }
  } catch {
    return {
      code: "external_api_error",
      message: `External API request failed with status ${response.status}`,
    }
  }
}

const requestJson = async <T>(input: {
  context: DoctorExternalApiContext
  fetchImpl: typeof fetch
  method: "GET" | "POST" | "DELETE"
  endpoint: string
  schema: z.ZodType<T>
  body?: unknown
  notFoundAsNull?: boolean
}): Promise<T | null> => {
  const url = new URL(input.endpoint, input.context.baseUrl)
  const payload = input.body === undefined ? undefined : JSON.stringify(input.body)

  let response: Response | null = null
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt += 1) {
    try {
      response = await input.fetchImpl(url, {
        method: input.method,
        headers: {
          authorization: `Bearer ${input.context.token}`,
          ...(payload === undefined ? {} : { "content-type": "application/json" }),
        },
        ...(payload === undefined ? {} : { body: payload }),
      })
      lastError = null
      break
    } catch (error) {
      lastError = error as Error

      if (attempt < RETRY_ATTEMPTS) {
        await new Promise((resolve) => {
          setTimeout(resolve, RETRY_DELAY_MS * attempt)
        })
      }
    }
  }

  if (!response && input.fetchImpl === fetch) {
    try {
      const fallback = await new Promise<{ statusCode: number; body: string }>(
        (resolve, reject) => {
          const client = url.protocol === "https:" ? https : http
          const request = client.request(
            {
              protocol: url.protocol,
              hostname: url.hostname,
              port: url.port,
              path: `${url.pathname}${url.search}`,
              method: input.method,
              headers: {
                authorization: `Bearer ${input.context.token}`,
                ...(payload === undefined ? {} : { "content-type": "application/json" }),
              },
            },
            (nodeResponse) => {
              let body = ""
              nodeResponse.setEncoding("utf8")
              nodeResponse.on("data", (chunk) => {
                body += chunk
              })
              nodeResponse.on("end", () => {
                resolve({ statusCode: nodeResponse.statusCode ?? 0, body })
              })
            }
          )

          request.on("error", (error) => {
            reject(error)
          })

          if (payload !== undefined) {
            request.write(payload)
          }

          request.end()
        }
      )

      response = new Response(fallback.body, {
        status: fallback.statusCode >= 100 ? fallback.statusCode : 500,
      })
    } catch (error) {
      lastError = error as Error
    }
  }

  if (!response) {
    throw new Error(lastError?.message ?? `External API request failed for ${input.endpoint}`)
  }

  if (input.notFoundAsNull && response.status === 404) {
    return null
  }

  if (!response.ok) {
    const parsed = await parseErrorMessage(response)
    throw new DoctorExternalApiError({
      code: parsed.code,
      message: parsed.message,
      statusCode: response.status,
      method: input.method,
      endpoint: input.endpoint,
    })
  }

  return input.schema.parse(await response.json())
}

export type DoctorExternalApiClient = {
  createJob: (input: {
    id: string
    type: string
    scheduleType: "oneshot"
    runAt: number
    payload?: Record<string, unknown>
    modelRef?: string | null
  }) => Promise<DoctorExternalTaskMutationResult>
  runJobNow: (jobId: string) => Promise<DoctorExternalTaskMutationResult>
  getJob: (jobId: string) => Promise<DoctorExternalJobRecord | null>
  listJobRuns: (input: { jobId: string; limit?: number; offset?: number }) => Promise<{
    taskId: string
    total: number
    limit: number
    offset: number
    runs: DoctorExternalJobRunRecord[]
  }>
  deleteJob: (jobId: string, reason?: string) => Promise<DoctorExternalTaskMutationResult | null>
  cancelBackgroundJob: (
    jobId: string,
    reason?: string
  ) => Promise<DoctorExternalBackgroundCancelResult | null>
}

export const createDoctorExternalApiClient = async (dependencies: {
  environment?: DoctorExternalApiEnvironment
  fetchImpl?: typeof fetch
}): Promise<DoctorExternalApiClient> => {
  const environment = dependencies.environment ?? process.env
  const fetchImpl = dependencies.fetchImpl ?? fetch
  const context = await resolveDoctorExternalApiContext(environment)

  return {
    createJob: async (input) => {
      const payload = {
        id: input.id,
        type: input.type,
        scheduleType: input.scheduleType,
        runAt: input.runAt,
        ...(input.payload ? { payload: input.payload } : {}),
        ...(input.modelRef === undefined ? {} : { modelRef: input.modelRef }),
      }

      const result = await requestJson({
        context,
        fetchImpl,
        method: "POST",
        endpoint: "/external/jobs",
        body: payload,
        schema: taskMutationResultSchema,
      })

      return result as DoctorExternalTaskMutationResult
    },
    runJobNow: async (jobId) => {
      const result = await requestJson({
        context,
        fetchImpl,
        method: "POST",
        endpoint: `/external/jobs/${encodeURIComponent(jobId)}/run-now`,
        schema: taskMutationResultSchema,
      })

      return result as DoctorExternalTaskMutationResult
    },
    getJob: async (jobId) => {
      const response = await requestJson({
        context,
        fetchImpl,
        method: "GET",
        endpoint: `/external/jobs/${encodeURIComponent(jobId)}`,
        schema: jobDetailsResponseSchema,
        notFoundAsNull: true,
      })

      return response?.job ?? null
    },
    listJobRuns: async (input) => {
      const query = new URLSearchParams({
        limit: String(input.limit ?? 20),
        offset: String(input.offset ?? 0),
      })

      const response = await requestJson({
        context,
        fetchImpl,
        method: "GET",
        endpoint: `/external/jobs/${encodeURIComponent(input.jobId)}/runs?${query.toString()}`,
        schema: jobRunsResponseSchema,
      })

      return response as {
        taskId: string
        total: number
        limit: number
        offset: number
        runs: DoctorExternalJobRunRecord[]
      }
    },
    deleteJob: async (jobId, reason) => {
      return await requestJson({
        context,
        fetchImpl,
        method: "DELETE",
        endpoint: `/external/jobs/${encodeURIComponent(jobId)}`,
        body: reason ? { reason } : {},
        schema: taskMutationResultSchema,
        notFoundAsNull: true,
      })
    },
    cancelBackgroundJob: async (jobId, reason) => {
      return await requestJson({
        context,
        fetchImpl,
        method: "POST",
        endpoint: `/external/background-jobs/${encodeURIComponent(jobId)}/cancel`,
        body: reason ? { reason } : {},
        schema: backgroundCancelResponseSchema,
        notFoundAsNull: true,
      })
    },
  }
}
