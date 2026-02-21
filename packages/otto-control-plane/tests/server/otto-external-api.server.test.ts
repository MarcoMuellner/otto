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
        return Response.json({ jobs: [{ id: "job-1" }] }, { status: 200 })
      },
    })

    // Act
    const payload = await client.listJobs()

    // Assert
    expect(payload).toEqual({ jobs: [{ id: "job-1" }] })
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
})
