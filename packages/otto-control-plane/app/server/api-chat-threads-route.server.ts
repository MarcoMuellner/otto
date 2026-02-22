import {
  createChatThreadRequestSchema,
  type ChatThread,
  type ChatThreadsResponse,
} from "../features/chat/contracts.js"
import { createChatSurfaceService } from "./chat-surface.server.js"
import {
  mapChatMutationErrorToResponse,
  mapChatReadErrorToResponse,
} from "./api-chat-errors.server.js"
import { readJsonActionBody } from "./api-jobs-mutations.server.js"

type ApiChatThreadsDependencies = {
  listThreads: () => Promise<ChatThreadsResponse>
  createThread: (title?: string) => Promise<ChatThread>
}

const defaultDependencies: ApiChatThreadsDependencies = {
  listThreads: async (): Promise<ChatThreadsResponse> => {
    const service = createChatSurfaceService()
    return service.listThreads()
  },
  createThread: async (title?: string): Promise<ChatThread> => {
    const service = createChatSurfaceService()
    return service.createThread(title)
  },
}

export const createApiChatThreadsLoader = (
  dependencies: ApiChatThreadsDependencies = defaultDependencies
) => {
  return async (): Promise<Response> => {
    try {
      const payload = await dependencies.listThreads()
      return Response.json(payload, { status: 200 })
    } catch (error) {
      return mapChatReadErrorToResponse(error)
    }
  }
}

export const createApiChatThreadsAction = (
  dependencies: ApiChatThreadsDependencies = defaultDependencies
) => {
  return async ({ request }: { request: Request }): Promise<Response> => {
    if (request.method.toUpperCase() !== "POST") {
      return Response.json(
        {
          error: "method_not_allowed",
          message: "Only POST is supported for /api/chat/threads",
        },
        { status: 405 }
      )
    }

    const bodyResult = await readJsonActionBody(request)
    if (!bodyResult.ok) {
      return bodyResult.response
    }

    try {
      const payload = createChatThreadRequestSchema.parse(bodyResult.body)
      const thread = await dependencies.createThread(payload.title)
      return Response.json({ thread }, { status: 201 })
    } catch (error) {
      return mapChatMutationErrorToResponse(error)
    }
  }
}

export const apiChatThreadsLoader = createApiChatThreadsLoader()
export const apiChatThreadsAction = createApiChatThreadsAction()
