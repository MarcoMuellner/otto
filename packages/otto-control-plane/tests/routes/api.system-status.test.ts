import { describe, expect, it } from "vitest"

import { createApiSystemStatusLoader } from "../../app/server/api-system-status-route.server.js"
import { OttoExternalApiError } from "../../app/server/otto-external-api.server.js"

describe("api.system.status loader", () => {
  it("returns 200 when runtime system snapshot is healthy", async () => {
    // Arrange
    const loader = createApiSystemStatusLoader({
      loadSystemStatus: async () => {
        return {
          status: "ok",
          checkedAt: 1_700_000_000_000,
          runtime: {
            version: "0.1.0-dev",
            pid: 1234,
            startedAt: 1_699_999_999_000,
            uptimeSec: 52,
          },
          services: [
            {
              id: "runtime",
              label: "Otto Runtime",
              status: "ok",
              message: "Runtime process is active",
            },
          ],
        }
      },
    })

    // Act
    const response = await loader()
    const body = await response.json()

    // Assert
    expect(response.status).toBe(200)
    expect(body).toMatchObject({ status: "ok" })
  })

  it("returns 503 when runtime system snapshot is degraded", async () => {
    // Arrange
    const loader = createApiSystemStatusLoader({
      loadSystemStatus: async () => {
        return {
          status: "degraded",
          checkedAt: 1_700_000_000_000,
          runtime: {
            version: "0.1.0-dev",
            pid: 1234,
            startedAt: 1_699_999_999_000,
            uptimeSec: 52,
          },
          services: [
            {
              id: "telegram_worker",
              label: "Telegram Worker",
              status: "degraded",
              message: "Worker failed to boot",
            },
          ],
        }
      },
    })

    // Act
    const response = await loader()

    // Assert
    expect(response.status).toBe(503)
  })

  it("maps runtime connectivity failures to 503", async () => {
    // Arrange
    const loader = createApiSystemStatusLoader({
      loadSystemStatus: async () => {
        throw new OttoExternalApiError("Runtime unavailable", 503)
      },
    })

    // Act
    const response = await loader()
    const body = await response.json()

    // Assert
    expect(response.status).toBe(503)
    expect(body).toMatchObject({ error: "runtime_unavailable" })
  })
})
