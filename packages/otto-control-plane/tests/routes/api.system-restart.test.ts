import { describe, expect, it } from "vitest"

import { createApiSystemRestartAction } from "../../app/server/api-system-restart-route.server.js"
import { OttoExternalApiError } from "../../app/server/otto-external-api.server.js"

describe("api.system.restart action", () => {
  it("returns 202 for accepted restart", async () => {
    // Arrange
    const action = createApiSystemRestartAction({
      restartSystem: async () => {
        return {
          status: "accepted",
          requestedAt: 1_700_000_000_000,
          message: "Runtime restart requested",
        }
      },
    })

    // Act
    const response = await action({
      request: new Request("http://localhost/api/system/restart", {
        method: "POST",
      }),
    })
    const body = await response.json()

    // Assert
    expect(response.status).toBe(202)
    expect(body).toMatchObject({ status: "accepted" })
  })

  it("rejects non-post methods", async () => {
    // Arrange
    const action = createApiSystemRestartAction({
      restartSystem: async () => {
        throw new Error("should not run")
      },
    })

    // Act
    const response = await action({
      request: new Request("http://localhost/api/system/restart", {
        method: "GET",
      }),
    })

    // Assert
    expect(response.status).toBe(405)
  })

  it("maps upstream failures to stable errors", async () => {
    // Arrange
    const action = createApiSystemRestartAction({
      restartSystem: async () => {
        throw new OttoExternalApiError("Runtime unavailable", 503)
      },
    })

    // Act
    const response = await action({
      request: new Request("http://localhost/api/system/restart", {
        method: "POST",
      }),
    })
    const body = await response.json()

    // Assert
    expect(response.status).toBe(503)
    expect(body).toMatchObject({ error: "runtime_unavailable" })
  })
})
