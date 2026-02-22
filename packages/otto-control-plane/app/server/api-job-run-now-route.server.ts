import { createOttoExternalApiClientFromEnvironment } from "./otto-external-api.server.js"
import type { ExternalJobMutationResponse } from "../features/jobs/contracts.js"
import { mapJobsMutationErrorToResponse } from "./api-jobs-mutations.server.js"

type ApiJobRunNowActionDependencies = {
  runNow: (jobId: string) => Promise<ExternalJobMutationResponse>
}

const defaultDependencies: ApiJobRunNowActionDependencies = {
  runNow: async (jobId: string): Promise<ExternalJobMutationResponse> => {
    const client = await createOttoExternalApiClientFromEnvironment()
    return client.runJobNow(jobId)
  },
}

/**
 * Creates the run-now BFF action so UI controls can request immediate scheduler eligibility
 * while preserving centralized runtime error mapping.
 */
export const createApiJobRunNowAction = (
  dependencies: ApiJobRunNowActionDependencies = defaultDependencies
) => {
  return async ({ params, request }: { params: { jobId?: string }; request: Request }) => {
    const jobId = params.jobId?.trim()
    if (!jobId) {
      return Response.json(
        {
          error: "invalid_request",
          message: "jobId is required",
        },
        { status: 400 }
      )
    }

    if (request.method.toUpperCase() !== "POST") {
      return Response.json(
        {
          error: "method_not_allowed",
          message: "Only POST is supported for /api/jobs/:jobId/run-now",
        },
        { status: 405 }
      )
    }

    try {
      const result = await dependencies.runNow(jobId)
      return Response.json(result, { status: 200 })
    } catch (error) {
      return mapJobsMutationErrorToResponse(error)
    }
  }
}

export const apiJobRunNowAction = createApiJobRunNowAction()
