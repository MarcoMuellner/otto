import {
  modelDefaultsUpdateRequestSchema,
  type ModelDefaultsResponse,
  type ModelDefaultsUpdateRequest,
} from "../features/models/contracts.js"
import {
  mapJobsMutationErrorToResponse,
  mapJobsReadErrorToResponse,
  readJsonActionBody,
} from "./api-jobs-mutations.server.js"
import { createOttoExternalApiClientFromEnvironment } from "./otto-external-api.server.js"

type ApiModelsDefaultsRouteDependencies = {
  loadDefaults: () => Promise<ModelDefaultsResponse>
  updateDefaults: (input: ModelDefaultsUpdateRequest) => Promise<ModelDefaultsResponse>
}

const defaultDependencies: ApiModelsDefaultsRouteDependencies = {
  loadDefaults: async (): Promise<ModelDefaultsResponse> => {
    const client = await createOttoExternalApiClientFromEnvironment()
    return client.getModelDefaults()
  },
  updateDefaults: async (input: ModelDefaultsUpdateRequest): Promise<ModelDefaultsResponse> => {
    const client = await createOttoExternalApiClientFromEnvironment()
    return client.updateModelDefaults(input)
  },
}

export const createApiModelsDefaultsLoader = (
  dependencies: ApiModelsDefaultsRouteDependencies = defaultDependencies
) => {
  return async (): Promise<Response> => {
    try {
      const defaults = await dependencies.loadDefaults()
      return Response.json(defaults, { status: 200 })
    } catch (error) {
      return mapJobsReadErrorToResponse(error)
    }
  }
}

export const createApiModelsDefaultsAction = (
  dependencies: ApiModelsDefaultsRouteDependencies = defaultDependencies
) => {
  return async ({ request }: { request: Request }): Promise<Response> => {
    if (request.method.toUpperCase() !== "PUT") {
      return Response.json(
        {
          error: "method_not_allowed",
          message: "Only PUT is supported for /api/models/defaults",
        },
        { status: 405 }
      )
    }

    const bodyResult = await readJsonActionBody(request)
    if (!bodyResult.ok) {
      return bodyResult.response
    }

    try {
      const payload = modelDefaultsUpdateRequestSchema.parse(bodyResult.body)
      const result = await dependencies.updateDefaults(payload)
      return Response.json(result, { status: 200 })
    } catch (error) {
      return mapJobsMutationErrorToResponse(error)
    }
  }
}

export const apiModelsDefaultsLoader = createApiModelsDefaultsLoader()
export const apiModelsDefaultsAction = createApiModelsDefaultsAction()
