import { sendChatMessageRequestSchema, type ChatStreamEvent } from "../features/chat/contracts.js"
import { createChatSurfaceService } from "./chat-surface.server.js"
import { mapChatMutationErrorToResponse } from "./api-chat-errors.server.js"
import { readJsonActionBody } from "./api-jobs-mutations.server.js"

type ApiChatThreadMessageStreamDependencies = {
  sendMessageStream: (threadId: string, text: string) => AsyncGenerator<ChatStreamEvent>
}

type ApiChatThreadMessageStreamRouteArgs = {
  params: {
    threadId?: string
  }
  request: Request
}

const defaultDependencies: ApiChatThreadMessageStreamDependencies = {
  sendMessageStream: (threadId: string, text: string) => {
    const service = createChatSurfaceService()
    return service.sendMessageStream(threadId, text)
  },
}

export const createApiChatThreadMessageStreamAction = (
  dependencies: ApiChatThreadMessageStreamDependencies = defaultDependencies
) => {
  return async ({ params, request }: ApiChatThreadMessageStreamRouteArgs): Promise<Response> => {
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
          message: "Only POST is supported for /api/chat/threads/:threadId/messages/stream",
        },
        { status: 405 }
      )
    }

    const bodyResult = await readJsonActionBody(request)
    if (!bodyResult.ok) {
      return bodyResult.response
    }

    let stream: AsyncGenerator<ChatStreamEvent>
    try {
      const payload = sendChatMessageRequestSchema.parse(bodyResult.body)
      stream = dependencies.sendMessageStream(threadId, payload.text)
    } catch (error) {
      return mapChatMutationErrorToResponse(error)
    }

    const encoder = new TextEncoder()
    const responseStream = new ReadableStream<Uint8Array>({
      start(controller) {
        const run = async () => {
          try {
            for await (const event of stream) {
              controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : "Could not stream message"
            controller.enqueue(
              encoder.encode(
                `${JSON.stringify({
                  type: "error",
                  message,
                })}\n`
              )
            )
          } finally {
            controller.close()
          }
        }

        void run()
      },
    })

    return new Response(responseStream, {
      status: 200,
      headers: {
        "content-type": "application/x-ndjson; charset=utf-8",
        "cache-control": "no-store",
      },
    })
  }
}

export const apiChatThreadMessageStreamAction = createApiChatThreadMessageStreamAction()
