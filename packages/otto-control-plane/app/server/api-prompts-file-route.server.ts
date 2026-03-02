import {
  promptFileSourceSchema,
  updatePromptFileRequestSchema,
  type PromptFileResponse,
  type PromptFileSource,
  type UpdatePromptFileRequest,
  type UpdatePromptFileResponse,
} from "../features/prompts/contracts.js"
import {
  mapPromptMutationErrorToResponse,
  mapPromptReadErrorToResponse,
} from "./api-prompts-errors.server.js"
import { readJsonActionBody } from "./api-jobs-mutations.server.js"
import { createOttoExternalApiClientFromEnvironment } from "./otto-external-api.server.js"

type ApiPromptsFileRouteDependencies = {
  readPromptFile: (source: PromptFileSource, relativePath: string) => Promise<PromptFileResponse>
  updatePromptFile: (input: UpdatePromptFileRequest) => Promise<UpdatePromptFileResponse>
}

const defaultDependencies: ApiPromptsFileRouteDependencies = {
  readPromptFile: async (source, relativePath): Promise<PromptFileResponse> => {
    const client = await createOttoExternalApiClientFromEnvironment()
    return client.getPromptFile(source, relativePath)
  },
  updatePromptFile: async (input): Promise<UpdatePromptFileResponse> => {
    const client = await createOttoExternalApiClientFromEnvironment()
    return client.updatePromptFile(input)
  },
}

export const createApiPromptsFileLoader = (
  dependencies: ApiPromptsFileRouteDependencies = defaultDependencies
) => {
  return async ({ request }: { request: Request }): Promise<Response> => {
    const searchParams = new URL(request.url).searchParams
    const rawSource = searchParams.get("source")
    const rawPath = searchParams.get("path")

    if (!rawSource || !rawPath || rawPath.trim().length === 0) {
      return Response.json(
        {
          error: "invalid_request",
          message: "source and path query params are required",
        },
        { status: 400 }
      )
    }

    try {
      const source = promptFileSourceSchema.parse(rawSource)
      const payload = await dependencies.readPromptFile(source, rawPath)
      return Response.json(payload, { status: 200 })
    } catch (error) {
      return mapPromptReadErrorToResponse(error)
    }
  }
}

export const createApiPromptsFileAction = (
  dependencies: ApiPromptsFileRouteDependencies = defaultDependencies
) => {
  return async ({ request }: { request: Request }): Promise<Response> => {
    if (request.method.toUpperCase() !== "PUT") {
      return Response.json(
        {
          error: "method_not_allowed",
          message: "Only PUT is supported for /api/prompts/file",
        },
        { status: 405 }
      )
    }

    const bodyResult = await readJsonActionBody(request)
    if (!bodyResult.ok) {
      return bodyResult.response
    }

    try {
      const payload = updatePromptFileRequestSchema.parse(bodyResult.body)
      const result = await dependencies.updatePromptFile(payload)
      return Response.json(result, { status: 200 })
    } catch (error) {
      return mapPromptMutationErrorToResponse(error)
    }
  }
}

export const apiPromptsFileLoader = createApiPromptsFileLoader()
export const apiPromptsFileAction = createApiPromptsFileAction()
