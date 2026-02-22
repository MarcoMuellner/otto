import { describe, expect, it } from "vitest"

import { createApiModelsCatalogLoader } from "../../app/server/api-models-catalog-route.server.js"
import { OttoExternalApiError } from "../../app/server/otto-external-api.server.js"

describe("api.models.catalog loader", () => {
  it("returns model catalog payload", async () => {
    // Arrange
    const loader = createApiModelsCatalogLoader({
      loadCatalog: async () => {
        return {
          models: ["openai/gpt-5.3-codex", "anthropic/claude-sonnet-4"],
          updatedAt: 1_700_000_000_000,
          source: "network",
        }
      },
    })

    // Act
    const response = await loader()

    // Assert
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.source).toBe("network")
    expect(body.models).toContain("openai/gpt-5.3-codex")
  })

  it("maps upstream failures", async () => {
    // Arrange
    const loader = createApiModelsCatalogLoader({
      loadCatalog: async () => {
        throw new OttoExternalApiError("Runtime unavailable", 503)
      },
    })

    // Act
    const response = await loader()

    // Assert
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({
      error: "runtime_unavailable",
    })
  })
})
