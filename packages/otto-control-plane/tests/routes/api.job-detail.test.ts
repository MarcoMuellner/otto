import { describe, expect, it } from "vitest"

import { createApiJobDetailLoader } from "../../app/server/api-job-detail-route.server.js"
import { OttoExternalApiError } from "../../app/server/otto-external-api.server.js"

describe("api.job-detail loader", () => {
  it("returns 200 with job payload", async () => {
    // Arrange
    const loader = createApiJobDetailLoader({
      loadJob: async () => {
        return { job: { id: "job-1" } }
      },
    })

    // Act
    const response = await loader({
      params: {
        jobId: "job-1",
      },
    })

    // Assert
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ job: { id: "job-1" } })
  })

  it("returns 404 when runtime reports unknown job", async () => {
    // Arrange
    const loader = createApiJobDetailLoader({
      loadJob: async () => {
        throw new OttoExternalApiError("not found", 404)
      },
    })

    // Act
    const response = await loader({
      params: {
        jobId: "missing",
      },
    })

    // Assert
    expect(response.status).toBe(404)
  })
})
