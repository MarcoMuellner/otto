import { type PromptFilesResponse } from "../features/prompts/contracts.js"
import { mapPromptReadErrorToResponse } from "./api-prompts-errors.server.js"
import { createOttoExternalApiClientFromEnvironment } from "./otto-external-api.server.js"

type ApiPromptsFilesLoaderDependencies = {
  listPromptFiles: () => Promise<PromptFilesResponse>
}

const defaultDependencies: ApiPromptsFilesLoaderDependencies = {
  listPromptFiles: async (): Promise<PromptFilesResponse> => {
    const client = await createOttoExternalApiClientFromEnvironment()
    return client.listPromptFiles()
  },
}

export const createApiPromptsFilesLoader = (
  dependencies: ApiPromptsFilesLoaderDependencies = defaultDependencies
) => {
  return async (): Promise<Response> => {
    try {
      const payload = await dependencies.listPromptFiles()
      return Response.json(payload, { status: 200 })
    } catch (error) {
      return mapPromptReadErrorToResponse(error)
    }
  }
}

export const apiPromptsFilesLoader = createApiPromptsFilesLoader()
