import { z } from "zod"

import {
  resolveCachedControlPlaneServerConfig,
  type ControlPlaneServerConfig,
} from "./env.server.js"

const healthResponseSchema = z.object({
  status: z.literal("ok"),
})

const jobsResponseSchema = z.object({
  jobs: z.array(z.unknown()),
})

export type OttoExternalHealthResponse = z.infer<typeof healthResponseSchema>
export type OttoExternalJobsResponse = z.infer<typeof jobsResponseSchema>

export class OttoExternalApiError extends Error {
  statusCode: number | null

  constructor(message: string, statusCode: number | null = null) {
    super(message)
    this.name = "OttoExternalApiError"
    this.statusCode = statusCode
  }
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

type OttoExternalApiClientInput = {
  config: ControlPlaneServerConfig
  fetchImpl?: FetchLike
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

/**
 * Creates a server-side Otto external API client so BFF route modules can call runtime
 * contracts with shared auth/header behavior and consistent response validation.
 *
 * @param input Resolved server config and optional fetch implementation override.
 * @returns External API client with typed read operations.
 */
export const createOttoExternalApiClient = ({
  config,
  fetchImpl = fetch,
}: OttoExternalApiClientInput) => {
  const request = async <T>(endpoint: string, schema: z.ZodType<T>): Promise<T> => {
    const url = new URL(endpoint, config.externalApiBaseUrl)
    const response = await fetchImpl(url, {
      method: "GET",
      headers: buildAuthHeaders(config.externalApiToken),
    })

    return parseResponse(response, schema, endpoint)
  }

  return {
    getHealth: async (): Promise<OttoExternalHealthResponse> => {
      return request("/external/health", healthResponseSchema)
    },
    listJobs: async (): Promise<OttoExternalJobsResponse> => {
      return request("/external/jobs", jobsResponseSchema)
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
