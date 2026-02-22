import { type ModelCatalogResponse } from "../features/models/contracts.js"
import { mapJobsReadErrorToResponse } from "./api-jobs-mutations.server.js"
import { createOttoExternalApiClientFromEnvironment } from "./otto-external-api.server.js"

type ApiModelsCatalogLoaderDependencies = {
  loadCatalog: () => Promise<ModelCatalogResponse>
}

const defaultDependencies: ApiModelsCatalogLoaderDependencies = {
  loadCatalog: async (): Promise<ModelCatalogResponse> => {
    const client = await createOttoExternalApiClientFromEnvironment()
    return client.getModelCatalog()
  },
}

export const createApiModelsCatalogLoader = (
  dependencies: ApiModelsCatalogLoaderDependencies = defaultDependencies
) => {
  return async (): Promise<Response> => {
    try {
      const catalog = await dependencies.loadCatalog()
      return Response.json(catalog, { status: 200 })
    } catch (error) {
      return mapJobsReadErrorToResponse(error)
    }
  }
}

export const apiModelsCatalogLoader = createApiModelsCatalogLoader()
