import http from "node:http"
import https from "node:https"
import { performance } from "node:perf_hooks"

import { z } from "zod"

import type { DoctorCheckDefinition, DoctorCheckOutput } from "../../contracts.js"
import { resolveFastExternalApiContext } from "./external-api.js"

type ConnectivityCheckDependencies = {
  now?: () => number
  fetchImpl?: typeof fetch
  environment?: NodeJS.ProcessEnv
}

const healthResponseSchema = z.object({
  status: z.string().trim().min(1),
})

const RETRY_ATTEMPTS = 3
const RETRY_DELAY_MS = 150

const probeWithNodeHttp = async (
  url: URL,
  token: string
): Promise<{ statusCode: number; body: string }> => {
  return await new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http
    const request = client.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
      (response) => {
        let body = ""
        response.setEncoding("utf8")
        response.on("data", (chunk) => {
          body += chunk
        })
        response.on("end", () => {
          resolve({
            statusCode: response.statusCode ?? 0,
            body,
          })
        })
      }
    )

    request.on("error", (error) => {
      reject(error)
    })

    request.end()
  })
}

export const createFastConnectivityCheck = (
  dependencies: ConnectivityCheckDependencies = {}
): DoctorCheckDefinition => {
  const now = dependencies.now ?? (() => performance.now())
  const fetchImpl = dependencies.fetchImpl ?? fetch
  const environment = dependencies.environment ?? process.env

  return {
    id: "fast.external.connectivity",
    phase: "fast.core",
    tier: "fast",
    timeoutMs: 15_000,
    run: async (): Promise<DoctorCheckOutput> => {
      const startedAt = now()

      let context: Awaited<ReturnType<typeof resolveFastExternalApiContext>>
      try {
        context = await resolveFastExternalApiContext(environment)
      } catch (error) {
        const err = error as Error
        return {
          severity: "error",
          summary: "External API auth context unavailable",
          evidence: [
            {
              code: "EXTERNAL_API_AUTH_CONTEXT_ERROR",
              message: err.message,
            },
          ],
        }
      }

      const endpoint = "/external/health"
      const url = new URL(endpoint, context.baseUrl)

      let response: Response | null = null
      let lastError: Error | null = null

      for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt += 1) {
        try {
          response = await fetchImpl(url, {
            method: "GET",
            headers: {
              authorization: `Bearer ${context.token}`,
            },
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

      if (!response && dependencies.fetchImpl === undefined) {
        try {
          const fallback = await probeWithNodeHttp(url, context.token)
          response = new Response(fallback.body, {
            status: fallback.statusCode >= 100 ? fallback.statusCode : 500,
          })
        } catch (error) {
          lastError = error as Error
        }
      }

      if (!response) {
        return {
          severity: "error",
          summary: "External API connectivity probe failed",
          evidence: [
            {
              code: "EXTERNAL_API_UNREACHABLE",
              message: lastError?.message ?? "unknown fetch error",
              details: {
                endpoint,
                attempts: RETRY_ATTEMPTS,
                durationMs: Math.round(now() - startedAt),
              },
            },
          ],
        }
      }

      const durationMs = Math.round(now() - startedAt)

      if (response.status === 401 || response.status === 403) {
        return {
          severity: "error",
          summary: "External API bearer authentication failed",
          evidence: [
            {
              code: "EXTERNAL_API_AUTH_FAILED",
              message: `External API returned ${response.status} for health endpoint`,
              details: {
                endpoint,
                statusCode: response.status,
                durationMs,
              },
            },
          ],
        }
      }

      if (!response.ok) {
        return {
          severity: "error",
          summary: "External API health probe returned non-success status",
          evidence: [
            {
              code: "EXTERNAL_API_HEALTH_HTTP_ERROR",
              message: `External API returned ${response.status} for health endpoint`,
              details: {
                endpoint,
                statusCode: response.status,
                durationMs,
              },
            },
          ],
        }
      }

      const bodyText = await response.text()
      let body: unknown = {}
      if (bodyText.trim().length > 0) {
        try {
          body = JSON.parse(bodyText)
        } catch {
          return {
            severity: "error",
            summary: "External API health probe returned invalid payload",
            evidence: [
              {
                code: "EXTERNAL_API_HEALTH_INVALID_PAYLOAD",
                message: "External API health response is not valid JSON",
                details: {
                  endpoint,
                  durationMs,
                },
              },
            ],
          }
        }
      }

      const parsed = healthResponseSchema.safeParse(body)
      if (!parsed.success || parsed.data.status !== "ok") {
        return {
          severity: "error",
          summary: "External API health probe returned unexpected status payload",
          evidence: [
            {
              code: "EXTERNAL_API_HEALTH_STATUS_UNEXPECTED",
              message: "External API health response did not report status=ok",
              details: {
                endpoint,
                durationMs,
              },
            },
          ],
        }
      }

      return {
        severity: "ok",
        summary: "External API connectivity and auth are healthy",
        evidence: [
          {
            code: "EXTERNAL_API_HEALTH_OK",
            message: "External API health endpoint responded with status=ok",
            details: {
              endpoint,
              statusCode: response.status,
              durationMs,
            },
          },
        ],
      }
    },
  }
}
