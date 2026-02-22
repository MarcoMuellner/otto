import { z } from "zod"

import { request as httpRequest } from "node:http"
import { request as httpsRequest } from "node:https"

import {
  modelCatalogResponseSchema,
  modelDefaultsResponseSchema,
  modelDefaultsUpdateRequestSchema,
  modelRefreshResponseSchema,
  type ModelCatalogResponse,
  type ModelDefaultsResponse,
  type ModelDefaultsUpdateRequest,
  type ModelRefreshResponse,
} from "../features/models/contracts.js"
import {
  createJobMutationRequestSchema,
  deleteJobMutationRequestSchema,
  externalJobMutationResponseSchema,
  externalSystemRestartResponseSchema,
  externalSystemStatusResponseSchema,
  externalJobAuditResponseSchema,
  externalJobRunDetailResponseSchema,
  externalJobRunsResponseSchema,
  externalJobResponseSchema,
  externalJobsResponseSchema,
  healthResponseSchema,
  type ExternalJobAuditResponse,
  type CreateJobMutationRequest,
  type DeleteJobMutationRequest,
  type ExternalJobMutationResponse,
  type ExternalSystemRestartResponse,
  type ExternalSystemStatusResponse,
  type ExternalJobRunDetailResponse,
  type ExternalJobRunsResponse,
  type ExternalJobResponse,
  type ExternalJobsResponse,
  type HealthResponse,
  type UpdateJobMutationRequest,
  updateJobMutationRequestSchema,
} from "../features/jobs/contracts.js"
import {
  notificationProfileResponseSchema,
  type NotificationProfileResponse,
  type UpdateNotificationProfileRequest,
  type UpdateNotificationProfileResponse,
  updateNotificationProfileRequestSchema,
  updateNotificationProfileResponseSchema,
} from "../features/settings/contracts.js"
import { resolveCachedControlPlaneServerConfig, type ControlPlaneServerConfig } from "./env.js"

export type OttoExternalHealthResponse = HealthResponse
export type OttoExternalJobsResponse = ExternalJobsResponse
export type OttoExternalJobResponse = ExternalJobResponse
export type OttoExternalJobAuditResponse = ExternalJobAuditResponse
export type OttoExternalJobRunsResponse = ExternalJobRunsResponse
export type OttoExternalJobRunDetailResponse = ExternalJobRunDetailResponse
export type OttoExternalJobMutationResponse = ExternalJobMutationResponse
export type OttoExternalSystemStatusResponse = ExternalSystemStatusResponse
export type OttoExternalSystemRestartResponse = ExternalSystemRestartResponse
export type OttoExternalNotificationProfileResponse = NotificationProfileResponse
export type OttoExternalUpdateNotificationProfileResponse = UpdateNotificationProfileResponse
export type OttoExternalModelCatalogResponse = ModelCatalogResponse
export type OttoExternalModelRefreshResponse = ModelRefreshResponse
export type OttoExternalModelDefaultsResponse = ModelDefaultsResponse

export class OttoExternalApiError extends Error {
  statusCode: number | null

  constructor(message: string, statusCode: number | null = null) {
    super(message)
    this.name = "OttoExternalApiError"
    this.statusCode = statusCode
  }
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"

type RequestLike = (
  url: URL,
  options: {
    method: HttpMethod
    headers: Record<string, string>
    bodyText?: string
  }
) => Promise<RawHttpResponse>

type RawHttpResponse = {
  statusCode: number
  bodyText: string
}

type OttoExternalApiClientInput = {
  config: ControlPlaneServerConfig
  fetchImpl?: FetchLike
  requestImpl?: RequestLike
}

const buildRequestHeaders = (token: string, includeJsonBody: boolean): Record<string, string> => {
  return {
    authorization: `Bearer ${token}`,
    ...(includeJsonBody
      ? {
          "content-type": "application/json",
        }
      : {}),
  }
}

const parseResponse = async <T>(
  response: Response,
  schema: z.ZodType<T>,
  endpoint: string
): Promise<T> => {
  if (!response.ok) {
    throw new OttoExternalApiError(
      `Otto external API request failed for ${endpoint} (${response.status})`,
      response.status
    )
  }

  const body = await response.json()
  const parsed = schema.safeParse(body)

  if (!parsed.success) {
    throw new OttoExternalApiError(`Otto external API returned invalid payload for ${endpoint}`)
  }

  return parsed.data
}

const parseRawResponse = <T>(
  response: RawHttpResponse,
  schema: z.ZodType<T>,
  endpoint: string
): T => {
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new OttoExternalApiError(
      `Otto external API request failed for ${endpoint} (${response.statusCode})`,
      response.statusCode
    )
  }

  let body: unknown
  try {
    body = response.bodyText.length === 0 ? {} : JSON.parse(response.bodyText)
  } catch {
    throw new OttoExternalApiError(`Otto external API returned invalid payload for ${endpoint}`)
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    throw new OttoExternalApiError(`Otto external API returned invalid payload for ${endpoint}`)
  }

  return parsed.data
}

const requestViaNodeHttp: RequestLike = async (url, options) => {
  const requestFn = url.protocol === "https:" ? httpsRequest : httpRequest

  return await new Promise<RawHttpResponse>((resolve, reject) => {
    const request = requestFn(
      url,
      {
        method: options.method,
        headers: options.headers,
      },
      (response) => {
        let bodyText = ""
        response.setEncoding("utf8")
        response.on("data", (chunk) => {
          bodyText += chunk
        })
        response.on("end", () => {
          resolve({
            statusCode: response.statusCode ?? 500,
            bodyText,
          })
        })
      }
    )

    request.on("error", reject)

    if (options.bodyText) {
      request.write(options.bodyText)
    }

    request.end()
  })
}

/**
 * Creates a server-side Otto external API client so BFF route modules can call runtime
 * contracts with shared auth/header behavior and consistent response validation.
 *
 * @param input Resolved server config and optional fetch implementation override.
 * @returns External API client with typed read operations.
 */
export const createOttoExternalApiClient = ({
  config,
  fetchImpl,
  requestImpl = requestViaNodeHttp,
}: OttoExternalApiClientInput) => {
  const request = async <T>(
    endpoint: string,
    schema: z.ZodType<T>,
    options?: {
      method?: HttpMethod
      body?: unknown
    }
  ): Promise<T> => {
    const method = options?.method ?? "GET"
    const hasBody = options?.body !== undefined
    const bodyText = hasBody ? JSON.stringify(options.body) : undefined
    const url = new URL(endpoint, config.externalApiBaseUrl)

    if (fetchImpl) {
      const response = await fetchImpl(url, {
        method,
        headers: buildRequestHeaders(config.externalApiToken, hasBody),
        body: bodyText,
      })

      return parseResponse(response, schema, endpoint)
    }

    const response = await requestImpl(url, {
      method,
      headers: buildRequestHeaders(config.externalApiToken, hasBody),
      bodyText,
    })

    return parseRawResponse(response, schema, endpoint)
  }

  return {
    getHealth: async (): Promise<OttoExternalHealthResponse> => {
      return request("/external/health", healthResponseSchema)
    },
    getSystemStatus: async (): Promise<OttoExternalSystemStatusResponse> => {
      return request("/external/system/status", externalSystemStatusResponseSchema)
    },
    restartSystem: async (): Promise<OttoExternalSystemRestartResponse> => {
      return request("/external/system/restart", externalSystemRestartResponseSchema, {
        method: "POST",
      })
    },
    getNotificationProfile: async (): Promise<OttoExternalNotificationProfileResponse> => {
      return request("/external/settings/notification-profile", notificationProfileResponseSchema)
    },
    updateNotificationProfile: async (
      input: UpdateNotificationProfileRequest
    ): Promise<OttoExternalUpdateNotificationProfileResponse> => {
      const payload = updateNotificationProfileRequestSchema.parse(input)
      return request(
        "/external/settings/notification-profile",
        updateNotificationProfileResponseSchema,
        {
          method: "PUT",
          body: payload,
        }
      )
    },
    getModelCatalog: async (): Promise<OttoExternalModelCatalogResponse> => {
      return request("/external/models/catalog", modelCatalogResponseSchema)
    },
    refreshModelCatalog: async (): Promise<OttoExternalModelRefreshResponse> => {
      return request("/external/models/refresh", modelRefreshResponseSchema, {
        method: "POST",
      })
    },
    getModelDefaults: async (): Promise<OttoExternalModelDefaultsResponse> => {
      return request("/external/models/defaults", modelDefaultsResponseSchema)
    },
    updateModelDefaults: async (
      input: ModelDefaultsUpdateRequest
    ): Promise<OttoExternalModelDefaultsResponse> => {
      const payload = modelDefaultsUpdateRequestSchema.parse(input)
      return request("/external/models/defaults", modelDefaultsResponseSchema, {
        method: "PUT",
        body: payload,
      })
    },
    listJobs: async (): Promise<OttoExternalJobsResponse> => {
      return request("/external/jobs?lane=scheduled", externalJobsResponseSchema)
    },
    getJob: async (jobId: string): Promise<OttoExternalJobResponse> => {
      return request(`/external/jobs/${encodeURIComponent(jobId)}`, externalJobResponseSchema)
    },
    getJobAudit: async (jobId: string, limit = 20): Promise<OttoExternalJobAuditResponse> => {
      const sanitizedLimit = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 200) : 20
      return request(
        `/external/jobs/${encodeURIComponent(jobId)}/audit?limit=${sanitizedLimit}`,
        externalJobAuditResponseSchema
      )
    },
    getJobRuns: async (
      jobId: string,
      options?: {
        limit?: number
        offset?: number
      }
    ): Promise<OttoExternalJobRunsResponse> => {
      const rawLimit = options?.limit
      const rawOffset = options?.offset

      const sanitizedLimit =
        typeof rawLimit === "number" && Number.isInteger(rawLimit)
          ? Math.min(Math.max(rawLimit, 1), 200)
          : 20
      const sanitizedOffset =
        typeof rawOffset === "number" && Number.isInteger(rawOffset) ? Math.max(rawOffset, 0) : 0

      return request(
        `/external/jobs/${encodeURIComponent(jobId)}/runs?limit=${sanitizedLimit}&offset=${sanitizedOffset}`,
        externalJobRunsResponseSchema
      )
    },
    getJobRun: async (jobId: string, runId: string): Promise<OttoExternalJobRunDetailResponse> => {
      return request(
        `/external/jobs/${encodeURIComponent(jobId)}/runs/${encodeURIComponent(runId)}`,
        externalJobRunDetailResponseSchema
      )
    },
    createJob: async (
      input: CreateJobMutationRequest
    ): Promise<OttoExternalJobMutationResponse> => {
      const payload = createJobMutationRequestSchema.parse(input)
      return request("/external/jobs", externalJobMutationResponseSchema, {
        method: "POST",
        body: payload,
      })
    },
    updateJob: async (
      jobId: string,
      input: UpdateJobMutationRequest
    ): Promise<OttoExternalJobMutationResponse> => {
      const payload = updateJobMutationRequestSchema.parse(input)
      return request(
        `/external/jobs/${encodeURIComponent(jobId)}`,
        externalJobMutationResponseSchema,
        {
          method: "PATCH",
          body: payload,
        }
      )
    },
    deleteJob: async (
      jobId: string,
      input?: DeleteJobMutationRequest
    ): Promise<OttoExternalJobMutationResponse> => {
      const payload = deleteJobMutationRequestSchema.parse(input ?? {})
      return request(
        `/external/jobs/${encodeURIComponent(jobId)}`,
        externalJobMutationResponseSchema,
        {
          method: "DELETE",
          body: payload,
        }
      )
    },
    runJobNow: async (jobId: string): Promise<OttoExternalJobMutationResponse> => {
      return request(
        `/external/jobs/${encodeURIComponent(jobId)}/run-now`,
        externalJobMutationResponseSchema,
        {
          method: "POST",
        }
      )
    },
  }
}

/**
 * Resolves cached server config and creates a runtime API client in one step so route loaders
 * can stay focused on HTTP translation instead of auth bootstrap concerns.
 *
 * @param fetchImpl Optional fetch implementation override for tests.
 * @returns Otto external API client bound to current server config.
 */
export const createOttoExternalApiClientFromEnvironment = async (fetchImpl?: FetchLike) => {
  const config = await resolveCachedControlPlaneServerConfig()
  return createOttoExternalApiClient({ config, fetchImpl })
}
