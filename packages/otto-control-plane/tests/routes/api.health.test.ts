import { describe, expect, it } from "vitest"

import { createApiHealthLoader } from "../../app/server/api-health-route.server.js"

describe("api.health loader", () => {
  it("returns 200 when runtime is available", async () => {
    // Arrange
    const loader = createApiHealthLoader({
      loadRuntimeHealth: async () => {
        return {
          status: "ok",
          runtimeStatus: "ok",
          message: "Runtime reachable",
          checkedAt: "2026-01-01T00:00:00.000Z",
        }
      },
    })

    // Act
    const response = await loader()
    const body = await response.json()

    // Assert
    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      status: "ok",
      runtimeStatus: "ok",
    })
  })

  it("returns 503 when runtime is unavailable", async () => {
    // Arrange
    const loader = createApiHealthLoader({
      loadRuntimeHealth: async () => {
        return {
          status: "degraded",
          runtimeStatus: "unavailable",
          message: "Runtime unavailable",
          checkedAt: "2026-01-01T00:00:00.000Z",
        }
      },
    })

    // Act
    const response = await loader()
    const body = await response.json()

    // Assert
    expect(response.status).toBe(503)
    expect(body).toMatchObject({
      status: "degraded",
      runtimeStatus: "unavailable",
    })
  })
})
