import {
  createOttoExternalApiClientFromEnvironment,
  OttoExternalApiError,
} from "./otto-external-api.server.js"
import type { ExternalJobsResponse } from "../features/jobs/contracts.js"

type ApiJobsLoaderDependencies = {
  loadJobs: () => Promise<ExternalJobsResponse>
}

const defaultDependencies: ApiJobsLoaderDependencies = {
  loadJobs: async (): Promise<ExternalJobsResponse> => {
    const client = await createOttoExternalApiClientFromEnvironment()
    return client.listJobs()
  },
}

/**
 * Creates the jobs API loader with dependency injection so route behavior can be verified
 * independently from network calls to Otto runtime.
 *
 * @param dependencies Optional dependency overrides for tests.
 * @returns React Router loader function for `/api/jobs`.
 */
export const createApiJobsLoader = (
  dependencies: ApiJobsLoaderDependencies = defaultDependencies
) => {
  return async (): Promise<Response> => {
    try {
      const jobs = await dependencies.loadJobs()
      return Response.json(jobs, { status: 200 })
    } catch (error) {
      if (error instanceof OttoExternalApiError) {
        return Response.json(
          {
            error: "runtime_unavailable",
            message: "Otto runtime is currently unavailable",
          },
          { status: 503 }
        )
      }

      return Response.json(
        {
          error: "internal_error",
          message: "Unexpected server error",
        },
        { status: 500 }
      )
    }
  }
}

export const apiJobsLoader = createApiJobsLoader()
