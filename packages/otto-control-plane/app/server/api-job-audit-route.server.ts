import {
  createOttoExternalApiClientFromEnvironment,
  OttoExternalApiError,
} from "./otto-external-api.server.js"

type ApiJobAuditLoaderDependencies = {
  loadJobAudit: (jobId: string, limit: number) => Promise<{ taskId: string; entries: unknown[] }>
}

type ApiJobAuditLoaderArgs = {
  params: {
    jobId?: string
  }
  request: Request
}

const parseLimit = (request: Request): number => {
  const rawLimit = new URL(request.url).searchParams.get("limit")
  if (!rawLimit) {
    return 20
  }

  const parsed = Number(rawLimit)
  if (!Number.isInteger(parsed)) {
    return 20
  }

  return Math.min(Math.max(parsed, 1), 200)
}

const defaultDependencies: ApiJobAuditLoaderDependencies = {
  loadJobAudit: async (
    jobId: string,
    limit: number
  ): Promise<{ taskId: string; entries: unknown[] }> => {
    const client = await createOttoExternalApiClientFromEnvironment()
    return client.getJobAudit(jobId, limit)
  },
}

/**
 * Creates a job audit API loader with injectable dependencies so route-level behavior remains
 * testable without runtime network calls.
 *
 * @param dependencies Optional dependency overrides for tests.
 * @returns React Router loader for `/api/jobs/:jobId/audit`.
 */
export const createApiJobAuditLoader = (
  dependencies: ApiJobAuditLoaderDependencies = defaultDependencies
) => {
  return async ({ params, request }: ApiJobAuditLoaderArgs): Promise<Response> => {
    const jobId = params.jobId?.trim()
    if (!jobId) {
      return Response.json(
        { error: "invalid_request", message: "jobId is required" },
        { status: 400 }
      )
    }

    try {
      const audit = await dependencies.loadJobAudit(jobId, parseLimit(request))
      return Response.json(audit, { status: 200 })
    } catch (error) {
      if (error instanceof OttoExternalApiError && error.statusCode === 404) {
        return Response.json({ error: "not_found", message: "Job not found" }, { status: 404 })
      }

      if (error instanceof OttoExternalApiError) {
        return Response.json(
          {
            error: "runtime_unavailable",
            message: "Otto runtime is currently unavailable",
          },
          { status: 503 }
        )
      }

      return Response.json(
        {
          error: "internal_error",
          message: "Unexpected server error",
        },
        { status: 500 }
      )
    }
  }
}

export const apiJobAuditLoader = createApiJobAuditLoader()
