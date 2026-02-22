import { type ModelRefreshResponse } from "../features/models/contracts.js"
import { mapJobsMutationErrorToResponse } from "./api-jobs-mutations.server.js"
import { createOttoExternalApiClientFromEnvironment } from "./otto-external-api.server.js"

type ApiModelsRefreshActionDependencies = {
  refreshCatalog: () => Promise<ModelRefreshResponse>
}

const defaultDependencies: ApiModelsRefreshActionDependencies = {
  refreshCatalog: async (): Promise<ModelRefreshResponse> => {
    const client = await createOttoExternalApiClientFromEnvironment()
    return client.refreshModelCatalog()
  },
}

export const createApiModelsRefreshAction = (
  dependencies: ApiModelsRefreshActionDependencies = defaultDependencies
) => {
  return async ({ request }: { request: Request }): Promise<Response> => {
    if (request.method.toUpperCase() !== "POST") {
      return Response.json(
        {
          error: "method_not_allowed",
          message: "Only POST is supported for /api/models/refresh",
        },
        { status: 405 }
      )
    }

    try {
      const result = await dependencies.refreshCatalog()
      return Response.json(result, { status: 200 })
    } catch (error) {
      return mapJobsMutationErrorToResponse(error)
    }
  }
}

export const apiModelsRefreshAction = createApiModelsRefreshAction()
