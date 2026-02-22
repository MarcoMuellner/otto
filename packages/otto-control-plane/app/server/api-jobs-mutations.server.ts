import { ZodError } from "zod"

import { OttoExternalApiError } from "./otto-external-api.server.js"

const systemReservedTaskTypes = new Set(["heartbeat", "watchdog_failures"])

export const isSystemReservedTaskType = (type: string): boolean => {
  return systemReservedTaskTypes.has(type.trim().toLowerCase())
}

const runtimeUnavailableResponse = (): Response => {
  return Response.json(
    {
      error: "runtime_unavailable",
      message: "Otto runtime is currently unavailable",
    },
    { status: 503 }
  )
}

/**
 * Reads JSON action payloads with a deterministic invalid-request contract so BFF mutation
 * routes can share one parsing path.
 */
export const readJsonActionBody = async (
  request: Request
): Promise<{ ok: true; body: unknown } | { ok: false; response: Response }> => {
  const raw = await request.text()
  if (raw.trim().length === 0) {
    return {
      ok: true,
      body: {},
    }
  }

  try {
    return {
      ok: true,
      body: JSON.parse(raw) as unknown,
    }
  } catch {
    return {
      ok: false,
      response: Response.json(
        {
          error: "invalid_request",
          message: "Request body must be valid JSON",
        },
        { status: 400 }
      ),
    }
  }
}

/**
 * Maps upstream and validation failures to stable mutation error responses used across all
 * jobs mutation BFF routes.
 */
export const mapJobsMutationErrorToResponse = (error: unknown): Response => {
  if (error instanceof ZodError) {
    return Response.json(
      {
        error: "invalid_request",
        details: error.issues,
      },
      { status: 400 }
    )
  }

  if (error instanceof OttoExternalApiError) {
    if (error.statusCode === 400) {
      return Response.json(
        {
          error: "invalid_request",
          message: "Mutation request is invalid",
        },
        { status: 400 }
      )
    }

    if (error.statusCode === 403) {
      return Response.json(
        {
          error: "forbidden_mutation",
          message: "System-managed jobs are read-only",
        },
        { status: 403 }
      )
    }

    if (error.statusCode === 404) {
      return Response.json(
        {
          error: "not_found",
          message: "Job not found",
        },
        { status: 404 }
      )
    }

    if (error.statusCode === 409) {
      return Response.json(
        {
          error: "state_conflict",
          message: "Job cannot be mutated in its current state",
        },
        { status: 409 }
      )
    }

    return runtimeUnavailableResponse()
  }

  return Response.json(
    {
      error: "internal_error",
      message: "Unexpected server error",
    },
    { status: 500 }
  )
}

export const mapJobsReadErrorToResponse = (error: unknown): Response => {
  if (error instanceof OttoExternalApiError) {
    return runtimeUnavailableResponse()
  }

  return Response.json(
    {
      error: "internal_error",
      message: "Unexpected server error",
    },
    { status: 500 }
  )
}
