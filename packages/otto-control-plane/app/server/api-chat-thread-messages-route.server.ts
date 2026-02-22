import {
  sendChatMessageRequestSchema,
  type ChatMessagesResponse,
  type SendChatMessageResponse,
} from "../features/chat/contracts.js"
import { createChatSurfaceService } from "./chat-surface.server.js"
import {
  mapChatMutationErrorToResponse,
  mapChatReadErrorToResponse,
} from "./api-chat-errors.server.js"
import { readJsonActionBody } from "./api-jobs-mutations.server.js"

type ApiChatThreadMessagesDependencies = {
  listMessages: (threadId: string) => Promise<ChatMessagesResponse>
  sendMessage: (threadId: string, text: string) => Promise<SendChatMessageResponse>
}

type ApiChatThreadMessagesRouteArgs = {
  params: {
    threadId?: string
  }
}

const defaultDependencies: ApiChatThreadMessagesDependencies = {
  listMessages: async (threadId: string): Promise<ChatMessagesResponse> => {
    const service = createChatSurfaceService()
    return service.listMessages(threadId)
  },
  sendMessage: async (threadId: string, text: string): Promise<SendChatMessageResponse> => {
    const service = createChatSurfaceService()
    return service.sendMessage(threadId, text)
  },
}

export const createApiChatThreadMessagesLoader = (
  dependencies: ApiChatThreadMessagesDependencies = defaultDependencies
) => {
  return async ({ params }: ApiChatThreadMessagesRouteArgs): Promise<Response> => {
    const threadId = params.threadId?.trim()
    if (!threadId) {
      return Response.json(
        { error: "invalid_request", message: "threadId is required" },
        { status: 400 }
      )
    }

    try {
      const payload = await dependencies.listMessages(threadId)
      return Response.json(payload, { status: 200 })
    } catch (error) {
      return mapChatReadErrorToResponse(error)
    }
  }
}

export const createApiChatThreadMessagesAction = (
  dependencies: ApiChatThreadMessagesDependencies = defaultDependencies
) => {
  return async ({ params, request }: ApiChatThreadMessagesRouteArgs & { request: Request }) => {
    const threadId = params.threadId?.trim()
    if (!threadId) {
      return Response.json(
        {
          error: "invalid_request",
          message: "threadId is required",
        },
        { status: 400 }
      )
    }

    if (request.method.toUpperCase() !== "POST") {
      return Response.json(
        {
          error: "method_not_allowed",
          message: "Only POST is supported for /api/chat/threads/:threadId/messages",
        },
        { status: 405 }
      )
    }

    const bodyResult = await readJsonActionBody(request)
    if (!bodyResult.ok) {
      return bodyResult.response
    }

    try {
      const payload = sendChatMessageRequestSchema.parse(bodyResult.body)
      const response = await dependencies.sendMessage(threadId, payload.text)
      return Response.json(response, { status: 200 })
    } catch (error) {
      return mapChatMutationErrorToResponse(error)
    }
  }
}

export const apiChatThreadMessagesLoader = createApiChatThreadMessagesLoader()
export const apiChatThreadMessagesAction = createApiChatThreadMessagesAction()
