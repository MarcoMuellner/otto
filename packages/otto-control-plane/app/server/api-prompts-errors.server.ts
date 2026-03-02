import { ZodError } from "zod"

import { OttoExternalApiError } from "./otto-external-api.server.js"

const runtimeUnavailable = (): Response => {
  return Response.json(
    {
      error: "runtime_unavailable",
      message: "Otto runtime is currently unavailable",
    },
    { status: 503 }
  )
}

export const mapPromptReadErrorToResponse = (error: unknown): Response => {
  if (error instanceof ZodError) {
    return Response.json(
      {
        error: "invalid_request",
        details: error.issues,
      },
      { status: 400 }
    )
  }

  if (error instanceof OttoExternalApiError && error.statusCode === 400) {
    return Response.json(
      {
        error: "invalid_request",
        message: "Prompt file request is invalid",
      },
      { status: 400 }
    )
  }

  if (error instanceof OttoExternalApiError && error.statusCode === 404) {
    return Response.json(
      {
        error: "not_found",
        message: "Prompt file not found",
      },
      { status: 404 }
    )
  }

  if (error instanceof OttoExternalApiError) {
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

export const mapPromptMutationErrorToResponse = (error: unknown): Response => {
  if (error instanceof ZodError) {
    return Response.json(
      {
        error: "invalid_request",
        details: error.issues,
      },
      { status: 400 }
    )
  }

  if (error instanceof OttoExternalApiError && error.statusCode === 400) {
    return Response.json(
      {
        error: "invalid_request",
        message: "Prompt file request is invalid",
      },
      { status: 400 }
    )
  }

  if (error instanceof OttoExternalApiError && error.statusCode === 403) {
    return Response.json(
      {
        error: "forbidden_mutation",
        message: "Only user-owned prompt files are editable",
      },
      { status: 403 }
    )
  }

  if (error instanceof OttoExternalApiError && error.statusCode === 404) {
    return Response.json(
      {
        error: "not_found",
        message: "Prompt file not found",
      },
      { status: 404 }
    )
  }

  if (error instanceof OttoExternalApiError) {
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
