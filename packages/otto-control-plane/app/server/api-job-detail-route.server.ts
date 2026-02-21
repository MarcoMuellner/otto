import {
  createOttoExternalApiClientFromEnvironment,
  OttoExternalApiError,
} from "./otto-external-api.server.js"

type ApiJobDetailLoaderDependencies = {
  loadJob: (jobId: string) => Promise<{ job: unknown }>
}

type ApiJobDetailLoaderArgs = {
  params: {
    jobId?: string
  }
}

const defaultDependencies: ApiJobDetailLoaderDependencies = {
  loadJob: async (jobId: string): Promise<{ job: unknown }> => {
    const client = await createOttoExternalApiClientFromEnvironment()
    return client.getJob(jobId)
  },
}

/**
 * Creates a job detail API loader with injectable dependencies so route-level behavior remains
 * testable without a live runtime API.
 *
 * @param dependencies Optional dependency overrides for tests.
 * @returns React Router loader for `/api/jobs/:jobId`.
 */
export const createApiJobDetailLoader = (
  dependencies: ApiJobDetailLoaderDependencies = defaultDependencies
) => {
  return async ({ params }: ApiJobDetailLoaderArgs): Promise<Response> => {
    const jobId = params.jobId?.trim()
    if (!jobId) {
      return Response.json(
        { error: "invalid_request", message: "jobId is required" },
        { status: 400 }
      )
    }

    try {
      const job = await dependencies.loadJob(jobId)
      return Response.json(job, { status: 200 })
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

export const apiJobDetailLoader = createApiJobDetailLoader()
