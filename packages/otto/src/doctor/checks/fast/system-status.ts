import { performance } from "node:perf_hooks"

import { z } from "zod"

import type { DoctorCheckDefinition, DoctorCheckOutput } from "../../contracts.js"
import { resolveFastExternalApiContext } from "./external-api.js"

type SystemStatusCheckDependencies = {
  now?: () => number
  fetchImpl?: typeof fetch
  environment?: NodeJS.ProcessEnv
}

const criticalServiceIds = new Set([
  "runtime",
  "opencode",
  "internal_api",
  "external_api",
  "scheduler",
])

const systemStatusResponseSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  services: z.array(
    z.object({
      id: z.string().trim().min(1),
      label: z.string().trim().min(1),
      status: z.enum(["ok", "degraded", "disabled"]),
      message: z.string().trim().min(1),
    })
  ),
})

export const createFastSystemStatusCheck = (
  dependencies: SystemStatusCheckDependencies = {}
): DoctorCheckDefinition => {
  const now = dependencies.now ?? (() => performance.now())
  const fetchImpl = dependencies.fetchImpl ?? fetch
  const environment = dependencies.environment ?? process.env

  return {
    id: "fast.external.system-status",
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

      const endpoint = "/external/system/status"
      const url = new URL(endpoint, context.baseUrl)

      let response: Response
      try {
        response = await fetchImpl(url, {
          method: "GET",
          headers: {
            authorization: `Bearer ${context.token}`,
          },
        })
      } catch (error) {
        const err = error as Error
        return {
          severity: "error",
          summary: "External system status probe failed",
          evidence: [
            {
              code: "EXTERNAL_SYSTEM_STATUS_UNREACHABLE",
              message: err.message,
              details: {
                endpoint,
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
              message: `External API returned ${response.status} for system status endpoint`,
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
          summary: "External system status probe returned non-success status",
          evidence: [
            {
              code: "EXTERNAL_SYSTEM_STATUS_HTTP_ERROR",
              message: `External API returned ${response.status} for system status endpoint`,
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
      let body: unknown
      try {
        body = JSON.parse(bodyText)
      } catch {
        return {
          severity: "error",
          summary: "External system status probe returned invalid payload",
          evidence: [
            {
              code: "EXTERNAL_SYSTEM_STATUS_INVALID_PAYLOAD",
              message: "External system status response is not valid JSON",
              details: {
                endpoint,
                durationMs,
              },
            },
          ],
        }
      }

      const parsed = systemStatusResponseSchema.safeParse(body)
      if (!parsed.success) {
        return {
          severity: "error",
          summary: "External system status probe returned invalid payload",
          evidence: [
            {
              code: "EXTERNAL_SYSTEM_STATUS_INVALID_PAYLOAD",
              message: "External system status response does not match contract",
              details: {
                endpoint,
                durationMs,
              },
            },
          ],
        }
      }

      const nonOkServices = parsed.data.services.filter((service) => service.status !== "ok")
      const criticalIssues = nonOkServices.filter((service) => criticalServiceIds.has(service.id))

      if (criticalIssues.length > 0) {
        return {
          severity: "error",
          summary: "Critical runtime services are degraded",
          evidence: criticalIssues.map((service) => ({
            code: "CRITICAL_SERVICE_DEGRADED",
            message: `${service.label} is ${service.status}`,
            details: {
              serviceId: service.id,
              serviceStatus: service.status,
              serviceMessage: service.message,
              endpoint,
              durationMs,
            },
          })),
        }
      }

      if (nonOkServices.length > 0) {
        return {
          severity: "warning",
          summary: "Non-critical runtime services are degraded",
          evidence: nonOkServices.map((service) => ({
            code: "NON_CRITICAL_SERVICE_DEGRADED",
            message: `${service.label} is ${service.status}`,
            details: {
              serviceId: service.id,
              serviceStatus: service.status,
              serviceMessage: service.message,
              endpoint,
              durationMs,
            },
          })),
        }
      }

      return {
        severity: "ok",
        summary: "External system status reports all services healthy",
        evidence: [
          {
            code: "EXTERNAL_SYSTEM_STATUS_OK",
            message: "System status endpoint reports all services as ok",
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
