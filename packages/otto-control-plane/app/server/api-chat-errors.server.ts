import { ZodError } from "zod"

import { OpencodeChatApiError } from "./chat-surface.server.js"

const runtimeUnavailable = (): Response => {
  return Response.json(
    {
      error: "runtime_unavailable",
      message: "OpenCode runtime is currently unavailable",
    },
    { status: 503 }
  )
}

export const mapChatReadErrorToResponse = (error: unknown): Response => {
  if (error instanceof OpencodeChatApiError && error.statusCode === 404) {
    return Response.json(
      {
        error: "not_found",
        message: "Chat thread not found",
      },
      { status: 404 }
    )
  }

  if (error instanceof OpencodeChatApiError) {
    return runtimeUnavailable()
  }

  return Response.json(
    {
      error: "internal_error",
      message: "Unexpected server error",
    },
    { status: 500 }
  )
}

export const mapChatMutationErrorToResponse = (error: unknown): Response => {
  if (error instanceof ZodError) {
    return Response.json(
      {
        error: "invalid_request",
        details: error.issues,
      },
      { status: 400 }
    )
  }

  if (error instanceof OpencodeChatApiError && error.statusCode === 404) {
    return Response.json(
      {
        error: "not_found",
        message: "Chat thread not found",
      },
      { status: 404 }
    )
  }

  if (error instanceof OpencodeChatApiError) {
    return runtimeUnavailable()
  }

  return Response.json(
    {
      error: "internal_error",
      message: "Unexpected server error",
    },
    { status: 500 }
  )
}
