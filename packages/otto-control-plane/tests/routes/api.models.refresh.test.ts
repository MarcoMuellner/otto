import { describe, expect, it } from "vitest"

import { createApiModelsRefreshAction } from "../../app/server/api-models-refresh-route.server.js"
import { OttoExternalApiError } from "../../app/server/otto-external-api.server.js"

describe("api.models.refresh action", () => {
  it("refreshes model catalog via POST", async () => {
    // Arrange
    const action = createApiModelsRefreshAction({
      refreshCatalog: async () => {
        return {
          status: "ok",
          updatedAt: 1_700_000_000_000,
          count: 12,
        }
      },
    })

    // Act
    const response = await action({
      request: new Request("http://localhost/api/models/refresh", {
        method: "POST",
      }),
    })

    // Assert
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ status: "ok", count: 12 })
  })

  it("rejects non-post methods", async () => {
    // Arrange
    const action = createApiModelsRefreshAction({
      refreshCatalog: async () => {
        throw new Error("should not run")
      },
    })

    // Act
    const response = await action({
      request: new Request("http://localhost/api/models/refresh", {
        method: "GET",
      }),
    })

    // Assert
    expect(response.status).toBe(405)
  })

  it("maps upstream failures", async () => {
    // Arrange
    const action = createApiModelsRefreshAction({
      refreshCatalog: async () => {
        throw new OttoExternalApiError("Runtime unavailable", 503)
      },
    })

    // Act
    const response = await action({
      request: new Request("http://localhost/api/models/refresh", {
        method: "POST",
      }),
    })

    // Assert
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ error: "runtime_unavailable" })
  })
})
