import { describe, expect, it } from "vitest"

import { createApiJobsLoader } from "../../app/server/api-jobs-route.server.js"
import { OttoExternalApiError } from "../../app/server/otto-external-api.server.js"

describe("api.jobs loader", () => {
  it("returns 200 and upstream payload on success", async () => {
    // Arrange
    const loader = createApiJobsLoader({
      loadJobs: async () => {
        return {
          jobs: [{ id: "job-1" }],
        }
      },
    })

    // Act
    const response = await loader()
    const body = await response.json()

    // Assert
    expect(response.status).toBe(200)
    expect(body).toEqual({ jobs: [{ id: "job-1" }] })
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
