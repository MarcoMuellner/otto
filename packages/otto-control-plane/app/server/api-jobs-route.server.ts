import { createOttoExternalApiClientFromEnvironment } from "./otto-external-api.server.js"
import {
  createJobMutationRequestSchema,
  type CreateJobMutationRequest,
  type ExternalJobMutationResponse,
  type ExternalJobsResponse,
} from "../features/jobs/contracts.js"
import {
  isSystemReservedTaskType,
  mapJobsMutationErrorToResponse,
  mapJobsReadErrorToResponse,
  readJsonActionBody,
} from "./api-jobs-mutations.server.js"

type ApiJobsRouteDependencies = {
  loadJobs: () => Promise<ExternalJobsResponse>
  createJob: (input: CreateJobMutationRequest) => Promise<ExternalJobMutationResponse>
}

const defaultDependencies: ApiJobsRouteDependencies = {
  loadJobs: async (): Promise<ExternalJobsResponse> => {
    const client = await createOttoExternalApiClientFromEnvironment()
    return client.listJobs()
  },
  createJob: async (input: CreateJobMutationRequest): Promise<ExternalJobMutationResponse> => {
    const client = await createOttoExternalApiClientFromEnvironment()
    return client.createJob(input)
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
  dependencies: ApiJobsRouteDependencies = defaultDependencies
) => {
  return async (): Promise<Response> => {
    try {
      const jobs = await dependencies.loadJobs()
      return Response.json(jobs, { status: 200 })
    } catch (error) {
      return mapJobsReadErrorToResponse(error)
    }
  }
}

/**
 * Creates the jobs API action handler for creation mutations so UI form submissions can route
 * through the BFF with consistent upstream error contracts.
 */
export const createApiJobsAction = (
  dependencies: ApiJobsRouteDependencies = defaultDependencies
) => {
  return async ({ request }: { request: Request }): Promise<Response> => {
    if (request.method.toUpperCase() !== "POST") {
      return Response.json(
        {
          error: "method_not_allowed",
          message: "Only POST is supported for /api/jobs",
        },
        { status: 405 }
      )
    }

    const bodyResult = await readJsonActionBody(request)
    if (!bodyResult.ok) {
      return bodyResult.response
    }

    try {
      const payload = createJobMutationRequestSchema.parse(bodyResult.body)
      if (isSystemReservedTaskType(payload.type)) {
        return Response.json(
          {
            error: "forbidden_mutation",
            message: "System-reserved job types cannot be created from control plane",
          },
          { status: 403 }
        )
      }

      const result = await dependencies.createJob(payload)
      return Response.json(result, { status: 201 })
    } catch (error) {
      return mapJobsMutationErrorToResponse(error)
    }
  }
}

export const apiJobsLoader = createApiJobsLoader()
export const apiJobsAction = createApiJobsAction()
