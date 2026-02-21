import {
  createOttoExternalApiClientFromEnvironment,
  OttoExternalApiError,
} from "./otto-external-api.server.js"

export type RuntimeHealthSnapshot = {
  status: "ok" | "degraded"
  runtimeStatus: "ok" | "unavailable"
  message: string
  checkedAt: string
}

/**
 * Produces a UI-friendly runtime health snapshot so home views and API endpoints can share one
 * interpretation path for upstream availability and failure messaging.
 *
 * @returns Runtime health snapshot with deterministic status fields.
 */
export const loadRuntimeHealthSnapshot = async (): Promise<RuntimeHealthSnapshot> => {
  try {
    const client = await createOttoExternalApiClientFromEnvironment()
    const response = await client.getHealth()

    return {
      status: response.status === "ok" ? "ok" : "degraded",
      runtimeStatus: response.status === "ok" ? "ok" : "unavailable",
      message: response.status === "ok" ? "Runtime reachable" : "Runtime returned degraded state",
      checkedAt: new Date().toISOString(),
    }
  } catch (error) {
    const suffix =
      error instanceof OttoExternalApiError && error.statusCode !== null
        ? ` (status ${error.statusCode})`
        : ""

    return {
      status: "degraded",
      runtimeStatus: "unavailable",
      message: `Runtime unavailable${suffix}`,
      checkedAt: new Date().toISOString(),
    }
  }
}
