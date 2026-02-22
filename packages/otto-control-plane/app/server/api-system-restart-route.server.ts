import { createOttoExternalApiClientFromEnvironment } from "./otto-external-api.server.js"
import type { ExternalSystemRestartResponse } from "../features/jobs/contracts.js"
import { mapJobsMutationErrorToResponse } from "./api-jobs-mutations.server.js"

type ApiSystemRestartActionDependencies = {
  restartSystem: () => Promise<ExternalSystemRestartResponse>
}

const defaultDependencies: ApiSystemRestartActionDependencies = {
  restartSystem: async (): Promise<ExternalSystemRestartResponse> => {
    const client = await createOttoExternalApiClientFromEnvironment()
    return client.restartSystem()
  },
}

/**
 * Creates the runtime restart action endpoint so control-plane UI can request a safe runtime
 * recycle while keeping restart authority in Otto runtime.
 */
export const createApiSystemRestartAction = (
  dependencies: ApiSystemRestartActionDependencies = defaultDependencies
) => {
  return async ({ request }: { request: Request }): Promise<Response> => {
    if (request.method.toUpperCase() !== "POST") {
      return Response.json(
        {
          error: "method_not_allowed",
          message: "Only POST is supported for /api/system/restart",
        },
        { status: 405 }
      )
    }

    try {
      const result = await dependencies.restartSystem()
      return Response.json(result, { status: 202 })
    } catch (error) {
      return mapJobsMutationErrorToResponse(error)
    }
  }
}

export const apiSystemRestartAction = createApiSystemRestartAction()
