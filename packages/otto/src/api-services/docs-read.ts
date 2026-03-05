import os from "node:os"
import path from "node:path"
import { readFile } from "node:fs/promises"

import { z } from "zod"

const docsErrorResponseSchema = z.object({
  error: z.enum([
    "auth_required",
    "invalid_request",
    "not_found",
    "version_mismatch",
    "upstream_unreachable",
    "unauthorized",
  ]),
  message: z.string().trim().min(1),
  details: z.record(z.string(), z.unknown()).optional(),
})

const docsSectionSchema = z.object({
  anchor: z.string().trim().min(1),
  title: z.string().trim().min(1),
})

const docsSearchResultSchema = z.object({
  version: z.string().trim().min(1),
  slug: z.string().trim().min(1),
  url: z.string().trim().min(1),
  title: z.string().trim().min(1),
  snippet: z.string(),
  sections: z.array(docsSectionSchema),
})

const docsSearchResponseSchema = z.object({
  query: z.string().trim().min(1),
  version: z.string().trim().min(1).nullable(),
  results: z.array(docsSearchResultSchema),
})

const docsOpenResponseSchema = z.object({
  page: z.object({
    version: z.string().trim().min(1),
    slug: z.string().trim().min(1),
    url: z.string().trim().min(1),
    title: z.string().trim().min(1),
    snippet: z.string(),
  }),
  section: z
    .object({
      anchor: z.string().trim().min(1),
      title: z.string().trim().min(1),
      url: z.string().trim().min(1),
    })
    .nullable(),
  sections: z.array(docsSectionSchema),
})

export type DocsSearchResponse = z.infer<typeof docsSearchResponseSchema>
export type DocsOpenResponse = z.infer<typeof docsOpenResponseSchema>

export class DocsReadError extends Error {
  code: Exclude<z.infer<typeof docsErrorResponseSchema>["error"], "unauthorized">
  statusCode: number
  details: Record<string, unknown> | null

  constructor(input: {
    code: Exclude<z.infer<typeof docsErrorResponseSchema>["error"], "unauthorized">
    message: string
    statusCode: number
    details?: Record<string, unknown>
  }) {
    super(input.message)
    this.name = "DocsReadError"
    this.code = input.code
    this.statusCode = input.statusCode
    this.details = input.details ?? null
  }
}

const normalizeHost = (host: string): string => {
  return host === "0.0.0.0" ? "127.0.0.1" : host
}

const normalizeBasePath = (value: string | undefined): string => {
  const raw = (value ?? "/").trim()
  if (!raw || raw === "/") {
    return ""
  }

  const withLeadingSlash = raw.startsWith("/") ? raw : `/${raw}`
  return withLeadingSlash.replace(/\/+$/g, "")
}

const resolveDocsServiceBaseUrl = (environment: NodeJS.ProcessEnv): string => {
  const explicit = environment.OTTO_DOCS_SERVICE_URL?.trim()
  if (explicit) {
    return explicit.replace(/\/+$/g, "")
  }

  const host = normalizeHost(environment.OTTO_DOCS_HOST?.trim() || "127.0.0.1")
  const port = environment.OTTO_DOCS_PORT?.trim() || "4174"
  const basePath = normalizeBasePath(environment.OTTO_DOCS_BASE_PATH)
  return `http://${host}:${port}${basePath}`
}

const resolveExternalApiToken = async (environment: NodeJS.ProcessEnv): Promise<string> => {
  const explicit = environment.OTTO_EXTERNAL_API_TOKEN?.trim()
  if (explicit) {
    return explicit
  }

  const ottoHome = environment.OTTO_HOME ?? path.join(os.homedir(), ".otto")
  const tokenPath =
    environment.OTTO_EXTERNAL_API_TOKEN_FILE?.trim() ||
    path.join(ottoHome, "secrets", "internal-api.token")
  const token = (await readFile(tokenPath, "utf8")).trim()
  if (!token) {
    throw new Error(`Otto external API token file is empty: ${tokenPath}`)
  }

  return token
}

const parseDocsError = async (response: Response): Promise<DocsReadError> => {
  try {
    const parsed = docsErrorResponseSchema.parse(await response.json())
    const code = parsed.error === "unauthorized" ? "auth_required" : parsed.error
    return new DocsReadError({
      code,
      message: parsed.message,
      statusCode: response.status,
      details: parsed.details,
    })
  } catch {
    return new DocsReadError({
      code: "upstream_unreachable",
      message: `Docs request failed with status ${response.status}`,
      statusCode: response.status,
    })
  }
}

const requestDocsJson = async <T>(input: {
  environment: NodeJS.ProcessEnv
  endpoint: string
  schema: z.ZodType<T>
  fetchImpl?: typeof fetch
  authToken?: string
}): Promise<T> => {
  const fetchImpl = input.fetchImpl ?? fetch
  const baseUrl = resolveDocsServiceBaseUrl(input.environment)
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`
  const relativeEndpoint = input.endpoint.replace(/^\/+/, "")
  const url = new URL(relativeEndpoint, normalizedBaseUrl)
  const headers: Record<string, string> = {}
  if (input.authToken) {
    headers.authorization = `Bearer ${input.authToken}`
  }

  const response = await fetchImpl(url, {
    method: "GET",
    headers,
  })

  if (!response.ok) {
    throw await parseDocsError(response)
  }

  return input.schema.parse(await response.json())
}

export const searchDocs = async (input: {
  query: string
  version?: string
  limit?: number
  environment?: NodeJS.ProcessEnv
  fetchImpl?: typeof fetch
}): Promise<DocsSearchResponse> => {
  const environment = input.environment ?? process.env
  const params = new URLSearchParams({ q: input.query })
  if (input.version) {
    params.set("version", input.version)
  }
  if (input.limit != null) {
    params.set("limit", String(input.limit))
  }

  return await requestDocsJson({
    environment,
    endpoint: `/api/docs/search?${params.toString()}`,
    schema: docsSearchResponseSchema,
    fetchImpl: input.fetchImpl,
  })
}

export const openDocs = async (input: {
  slug: string
  version?: string
  section?: string
  includeLiveData?: boolean
  environment?: NodeJS.ProcessEnv
  fetchImpl?: typeof fetch
}): Promise<DocsOpenResponse & { liveData: unknown | null }> => {
  const environment = input.environment ?? process.env
  const params = new URLSearchParams({ slug: input.slug })
  if (input.version) {
    params.set("version", input.version)
  }
  if (input.section) {
    params.set("section", input.section.replace(/^#/, ""))
  }

  const pageResult = await requestDocsJson({
    environment,
    endpoint: `/api/docs/open?${params.toString()}`,
    schema: docsOpenResponseSchema,
    fetchImpl: input.fetchImpl,
  })

  if ((input.includeLiveData ?? true) && pageResult.page.slug === "/live") {
    const token = await resolveExternalApiToken(environment)
    const liveData = await requestDocsJson({
      environment,
      endpoint: "/api/live/self-awareness",
      schema: z.unknown(),
      fetchImpl: input.fetchImpl,
      authToken: token,
    })

    return {
      ...pageResult,
      liveData,
    }
  }

  return {
    ...pageResult,
    liveData: null,
  }
}
