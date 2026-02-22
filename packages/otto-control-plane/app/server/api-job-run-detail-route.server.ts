import type { ExternalJobRunDetailResponse } from "../features/jobs/contracts.js"
import {
  createOttoExternalApiClientFromEnvironment,
  OttoExternalApiError,
} from "./otto-external-api.server.js"

type ApiJobRunDetailLoaderDependencies = {
  loadJobRun: (jobId: string, runId: string) => Promise<ExternalJobRunDetailResponse>
}

type ApiJobRunDetailLoaderArgs = {
  params: {
    jobId?: string
    runId?: string
  }
}

const defaultDependencies: ApiJobRunDetailLoaderDependencies = {
  loadJobRun: async (jobId: string, runId: string): Promise<ExternalJobRunDetailResponse> => {
    const client = await createOttoExternalApiClientFromEnvironment()
    return client.getJobRun(jobId, runId)
  },
}

/**
 * Creates a job-run detail API loader with injectable dependencies so route-level behavior stays
 * testable without runtime network calls.
 *
 * @param dependencies Optional dependency overrides for tests.
 * @returns React Router loader for `/api/jobs/:jobId/runs/:runId`.
 */
export const createApiJobRunDetailLoader = (
  dependencies: ApiJobRunDetailLoaderDependencies = defaultDependencies
) => {
  return async ({ params }: ApiJobRunDetailLoaderArgs): Promise<Response> => {
    const jobId = params.jobId?.trim()
    const runId = params.runId?.trim()

    if (!jobId || !runId) {
      return Response.json(
        { error: "invalid_request", message: "jobId and runId are required" },
        { status: 400 }
      )
    }

    try {
      const run = await dependencies.loadJobRun(jobId, runId)
      return Response.json(run, { status: 200 })
    } catch (error) {
      if (error instanceof OttoExternalApiError && error.statusCode === 404) {
        return Response.json({ error: "not_found", message: "Job run not found" }, { status: 404 })
      }

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

export const apiJobRunDetailLoader = createApiJobRunDetailLoader()
