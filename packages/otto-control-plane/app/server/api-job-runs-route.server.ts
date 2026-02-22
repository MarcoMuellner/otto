import type { ExternalJobRunsResponse } from "../features/jobs/contracts.js"
import {
  createOttoExternalApiClientFromEnvironment,
  OttoExternalApiError,
} from "./otto-external-api.server.js"

type ApiJobRunsLoaderDependencies = {
  loadJobRuns: (jobId: string, limit: number, offset: number) => Promise<ExternalJobRunsResponse>
}

type ApiJobRunsLoaderArgs = {
  params: {
    jobId?: string
  }
  request: Request
}

const parsePagination = (request: Request): { limit: number; offset: number } => {
  const searchParams = new URL(request.url).searchParams
  const rawLimit = searchParams.get("limit")
  const rawOffset = searchParams.get("offset")

  const limit =
    rawLimit !== null && Number.isInteger(Number(rawLimit))
      ? Math.min(Math.max(Number(rawLimit), 1), 200)
      : 20
  const offset =
    rawOffset !== null && Number.isInteger(Number(rawOffset)) ? Math.max(Number(rawOffset), 0) : 0

  return { limit, offset }
}

const defaultDependencies: ApiJobRunsLoaderDependencies = {
  loadJobRuns: async (
    jobId: string,
    limit: number,
    offset: number
  ): Promise<ExternalJobRunsResponse> => {
    const client = await createOttoExternalApiClientFromEnvironment()
    return client.getJobRuns(jobId, { limit, offset })
  },
}

/**
 * Creates a job runs API loader with injectable dependencies so run-history behavior stays
 * testable without live runtime network calls.
 *
 * @param dependencies Optional dependency overrides for tests.
 * @returns React Router loader for `/api/jobs/:jobId/runs`.
 */
export const createApiJobRunsLoader = (
  dependencies: ApiJobRunsLoaderDependencies = defaultDependencies
) => {
  return async ({ params, request }: ApiJobRunsLoaderArgs): Promise<Response> => {
    const jobId = params.jobId?.trim()
    if (!jobId) {
      return Response.json(
        { error: "invalid_request", message: "jobId is required" },
        { status: 400 }
      )
    }

    const { limit, offset } = parsePagination(request)

    try {
      const runs = await dependencies.loadJobRuns(jobId, limit, offset)
      return Response.json(runs, { status: 200 })
    } catch (error) {
      if (error instanceof OttoExternalApiError && error.statusCode === 404) {
        return Response.json({ error: "not_found", message: "Job not found" }, { status: 404 })
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

export const apiJobRunsLoader = createApiJobRunsLoader()
