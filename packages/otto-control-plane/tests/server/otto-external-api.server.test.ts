import { describe, expect, it } from "vitest"

import {
  createOttoExternalApiClient,
  OttoExternalApiError,
} from "../../app/server/otto-external-api.server.js"

const resolveAuthorizationHeader = (headers: HeadersInit | undefined): string | null => {
  if (!headers) {
    return null
  }

  if (headers instanceof Headers) {
    return headers.get("authorization")
  }

  if (Array.isArray(headers)) {
    const found = headers.find(([key]) => key.toLowerCase() === "authorization")
    return found ? found[1] : null
  }

  const direct = headers.authorization
  if (typeof direct === "string") {
    return direct
  }

  const upper = headers.Authorization
  return typeof upper === "string" ? upper : null
}

describe("createOttoExternalApiClient", () => {
  const createListItem = () => {
    return {
      id: "job-1",
      type: "heartbeat",
      scheduleType: "recurring",
      profileId: null,
      status: "idle",
      runAt: null,
      cadenceMinutes: 5,
      nextRunAt: 1_000,
      terminalState: null,
      terminalReason: null,
      updatedAt: 1_000,
      managedBy: "system",
      isMutable: false,
    }
  }

  it("sends bearer token on health requests", async () => {
    // Arrange
    const seenRequests: Array<{ url: string; authorization: string | null }> = []

    const client = createOttoExternalApiClient({
      config: {
        externalApiBaseUrl: "http://127.0.0.1:4190",
        externalApiToken: "secret-token",
      },
      fetchImpl: async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const requestUrl = typeof input === "string" ? input : input.toString()
        const authorization = resolveAuthorizationHeader(init?.headers)

        seenRequests.push({ url: requestUrl, authorization })

        return Response.json({ status: "ok" }, { status: 200 })
      },
    })

    // Act
    await client.getHealth()

    // Assert
    expect(seenRequests).toEqual([
      {
        url: "http://127.0.0.1:4190/external/health",
        authorization: "Bearer secret-token",
      },
    ])
  })

  it("returns jobs payload for jobs endpoint", async () => {
    // Arrange
    const client = createOttoExternalApiClient({
      config: {
        externalApiBaseUrl: "http://127.0.0.1:4190",
        externalApiToken: "secret-token",
      },
      fetchImpl: async (): Promise<Response> => {
        return Response.json({ jobs: [createListItem()] }, { status: 200 })
      },
    })

    // Act
    const payload = await client.listJobs()

    // Assert
    expect(payload).toEqual({ jobs: [createListItem()] })
  })

  it("throws OttoExternalApiError on non-2xx responses", async () => {
    // Arrange
    const client = createOttoExternalApiClient({
      config: {
        externalApiBaseUrl: "http://127.0.0.1:4190",
        externalApiToken: "secret-token",
      },
      fetchImpl: async (): Promise<Response> => {
        return Response.json({ error: "unauthorized" }, { status: 401 })
      },
    })

    // Act + Assert
    await expect(client.getHealth()).rejects.toBeInstanceOf(OttoExternalApiError)
  })

  it("fetches job details and audit payload", async () => {
    // Arrange
    const responses = new Map<string, Response>([
      [
        "http://127.0.0.1:4190/external/jobs/job-1",
        Response.json(
          {
            job: {
              id: "job-1",
              type: "heartbeat",
              status: "idle",
              scheduleType: "recurring",
              profileId: null,
              runAt: null,
              cadenceMinutes: 5,
              payload: null,
              lastRunAt: null,
              nextRunAt: 1_000,
              terminalState: null,
              terminalReason: null,
              lockToken: null,
              lockExpiresAt: null,
              createdAt: 1_000,
              updatedAt: 1_000,
              managedBy: "system",
              isMutable: false,
            },
          },
          { status: 200 }
        ),
      ],
      [
        "http://127.0.0.1:4190/external/jobs/job-1/audit?limit=25",
        Response.json(
          {
            taskId: "job-1",
            entries: [
              {
                id: "audit-1",
                taskId: "job-1",
                action: "update",
                lane: "scheduled",
                actor: "system",
                metadataJson: "{}",
                createdAt: 2_000,
              },
            ],
          },
          { status: 200 }
        ),
      ],
    ])

    const client = createOttoExternalApiClient({
      config: {
        externalApiBaseUrl: "http://127.0.0.1:4190",
        externalApiToken: "secret-token",
      },
      fetchImpl: async (input: RequestInfo | URL): Promise<Response> => {
        const key = typeof input === "string" ? input : input.toString()
        const response = responses.get(key)
        if (!response) {
          return Response.json({ error: "not_found" }, { status: 404 })
        }

        return response
      },
    })

    // Act
    const detail = await client.getJob("job-1")
    const audit = await client.getJobAudit("job-1", 25)

    // Assert
    expect(detail.job.id).toBe("job-1")
    expect(audit.taskId).toBe("job-1")
    expect(audit.entries[0]?.id).toBe("audit-1")
  })
})
