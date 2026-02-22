import { createOttoExternalApiClientFromEnvironment } from "./otto-external-api.server.js"
import type { ExternalSystemStatusResponse } from "../features/jobs/contracts.js"
import { mapJobsReadErrorToResponse } from "./api-jobs-mutations.server.js"

type ApiSystemStatusLoaderDependencies = {
  loadSystemStatus: () => Promise<ExternalSystemStatusResponse>
}

const defaultDependencies: ApiSystemStatusLoaderDependencies = {
  loadSystemStatus: async (): Promise<ExternalSystemStatusResponse> => {
    const client = await createOttoExternalApiClientFromEnvironment()
    return client.getSystemStatus()
  },
}

/**
 * Creates the system status API loader so UI runtime operations use one BFF translation path
 * with deterministic upstream error handling.
 */
export const createApiSystemStatusLoader = (
  dependencies: ApiSystemStatusLoaderDependencies = defaultDependencies
) => {
  return async (): Promise<Response> => {
    try {
      const snapshot = await dependencies.loadSystemStatus()
      const statusCode = snapshot.status === "ok" ? 200 : 503
      return Response.json(snapshot, { status: statusCode })
    } catch (error) {
      return mapJobsReadErrorToResponse(error)
    }
  }
}

export const apiSystemStatusLoader = createApiSystemStatusLoader()
