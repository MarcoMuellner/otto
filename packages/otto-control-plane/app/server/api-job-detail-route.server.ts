import {
  createOttoExternalApiClientFromEnvironment,
  OttoExternalApiError,
} from "./otto-external-api.server.js"
import {
  deleteJobMutationRequestSchema,
  type ExternalJobMutationResponse,
  type ExternalJobResponse,
  type UpdateJobMutationRequest,
  updateJobMutationRequestSchema,
} from "../features/jobs/contracts.js"
import {
  isSystemReservedTaskType,
  mapJobsMutationErrorToResponse,
  readJsonActionBody,
} from "./api-jobs-mutations.server.js"

type ApiJobDetailRouteDependencies = {
  loadJob: (jobId: string) => Promise<ExternalJobResponse>
  updateJob: (
    jobId: string,
    input: UpdateJobMutationRequest
  ) => Promise<ExternalJobMutationResponse>
  deleteJob: (jobId: string, reason?: string) => Promise<ExternalJobMutationResponse>
}

type ApiJobDetailLoaderArgs = {
  params: {
    jobId?: string
  }
}

const defaultDependencies: ApiJobDetailRouteDependencies = {
  loadJob: async (jobId: string): Promise<ExternalJobResponse> => {
    const client = await createOttoExternalApiClientFromEnvironment()
    return client.getJob(jobId)
  },
  updateJob: async (
    jobId: string,
    input: UpdateJobMutationRequest
  ): Promise<ExternalJobMutationResponse> => {
    const client = await createOttoExternalApiClientFromEnvironment()
    return client.updateJob(jobId, input)
  },
  deleteJob: async (jobId: string, reason?: string): Promise<ExternalJobMutationResponse> => {
    const client = await createOttoExternalApiClientFromEnvironment()
    return client.deleteJob(jobId, reason ? { reason } : undefined)
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
  dependencies: ApiJobDetailRouteDependencies = defaultDependencies
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

/**
 * Creates a job detail mutation action handler so edit/cancel controls can submit through
 * `/api/jobs/:jobId` with method-based routing.
 */
export const createApiJobDetailAction = (
  dependencies: ApiJobDetailRouteDependencies = defaultDependencies
) => {
  return async ({ params, request }: { params: { jobId?: string }; request: Request }) => {
    const jobId = params.jobId?.trim()
    if (!jobId) {
      return Response.json(
        { error: "invalid_request", message: "jobId is required" },
        { status: 400 }
      )
    }

    const method = request.method.toUpperCase()
    if (method !== "PATCH" && method !== "DELETE") {
      return Response.json(
        {
          error: "method_not_allowed",
          message: "Only PATCH and DELETE are supported for /api/jobs/:jobId",
        },
        { status: 405 }
      )
    }

    const bodyResult = await readJsonActionBody(request)
    if (!bodyResult.ok) {
      return bodyResult.response
    }

    try {
      if (method === "PATCH") {
        const payload = updateJobMutationRequestSchema.parse(bodyResult.body)
        if (payload.type && isSystemReservedTaskType(payload.type)) {
          return Response.json(
            {
              error: "forbidden_mutation",
              message: "System-reserved job types cannot be set from control plane",
            },
            { status: 403 }
          )
        }

        const result = await dependencies.updateJob(jobId, payload)
        return Response.json(result, { status: 200 })
      }

      const payload = deleteJobMutationRequestSchema.parse(bodyResult.body)
      const result = await dependencies.deleteJob(jobId, payload.reason)
      return Response.json(result, { status: 200 })
    } catch (error) {
      return mapJobsMutationErrorToResponse(error)
    }
  }
}

export const apiJobDetailLoader = createApiJobDetailLoader()
export const apiJobDetailAction = createApiJobDetailAction()
