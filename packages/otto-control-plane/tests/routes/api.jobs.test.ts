import { describe, expect, it } from "vitest"

import { createApiJobsLoader } from "../../app/server/api-jobs-route.server.js"
import { OttoExternalApiError } from "../../app/server/otto-external-api.server.js"

describe("api.jobs loader", () => {
  it("returns 200 and upstream payload on success", async () => {
    // Arrange
    const loader = createApiJobsLoader({
      loadJobs: async () => {
        return {
          jobs: [
            {
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
    expect(body).toMatchObject({ jobs: [{ id: "job-1" }] })
  })

  it("returns 503 for Otto external API failures", async () => {
    // Arrange
    const loader = createApiJobsLoader({
      loadJobs: async () => {
        throw new OttoExternalApiError("Runtime unavailable", 503)
      },
    })

    // Act
    const response = await loader()
    const body = await response.json()

    // Assert
    expect(response.status).toBe(503)
    expect(body).toMatchObject({
      error: "runtime_unavailable",
    })
  })
})
