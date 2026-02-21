import { z } from "zod"

import { request as httpRequest } from "node:http"
import { request as httpsRequest } from "node:https"

import {
  externalJobAuditResponseSchema,
  externalJobResponseSchema,
  externalJobsResponseSchema,
  healthResponseSchema,
  type ExternalJobAuditResponse,
  type ExternalJobResponse,
  type ExternalJobsResponse,
  type HealthResponse,
} from "../features/jobs/contracts.js"
import { resolveCachedControlPlaneServerConfig, type ControlPlaneServerConfig } from "./env.js"

export type OttoExternalHealthResponse = HealthResponse
export type OttoExternalJobsResponse = ExternalJobsResponse
export type OttoExternalJobResponse = ExternalJobResponse
export type OttoExternalJobAuditResponse = ExternalJobAuditResponse

export class OttoExternalApiError extends Error {
  statusCode: number | null

  constructor(message: string, statusCode: number | null = null) {
    super(message)
    this.name = "OttoExternalApiError"
    this.statusCode = statusCode
  }
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
type RequestLike = (url: URL, headers: Record<string, string>) => Promise<RawHttpResponse>

type RawHttpResponse = {
  statusCode: number
  bodyText: string
}

type OttoExternalApiClientInput = {
  config: ControlPlaneServerConfig
  fetchImpl?: FetchLike
  requestImpl?: RequestLike
}

const buildAuthHeaders = (token: string): Record<string, string> => {
  return {
    authorization: `Bearer ${token}`,
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

const requestViaNodeHttp: RequestLike = async (url, headers) => {
  const requestFn = url.protocol === "https:" ? httpsRequest : httpRequest

  return await new Promise<RawHttpResponse>((resolve, reject) => {
    const request = requestFn(
      url,
      {
        method: "GET",
        headers,
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
  const request = async <T>(endpoint: string, schema: z.ZodType<T>): Promise<T> => {
    const url = new URL(endpoint, config.externalApiBaseUrl)
    if (fetchImpl) {
      const response = await fetchImpl(url, {
        method: "GET",
        headers: buildAuthHeaders(config.externalApiToken),
      })

      return parseResponse(response, schema, endpoint)
    }

    const response = await requestImpl(url, buildAuthHeaders(config.externalApiToken))

    return parseRawResponse(response, schema, endpoint)
  }

  return {
    getHealth: async (): Promise<OttoExternalHealthResponse> => {
      return request("/external/health", healthResponseSchema)
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
