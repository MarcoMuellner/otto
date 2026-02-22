import { describe, expect, it } from "vitest"

import { createApiJobRunNowAction } from "../../app/server/api-job-run-now-route.server.js"
import { OttoExternalApiError } from "../../app/server/otto-external-api.server.js"

describe("api.job-run-now action", () => {
  it("schedules immediate eligibility for mutable jobs", async () => {
    // Arrange
    const action = createApiJobRunNowAction({
      runNow: async (jobId) => {
        expect(jobId).toBe("job-1")

        return {
          id: "job-1",
          status: "run_now_scheduled",
          scheduledFor: 1_700_000_000,
        }
      },
    })

    // Act
    const response = await action({
      params: {
        jobId: "job-1",
      },
      request: new Request("http://localhost/api/jobs/job-1/run-now", {
        method: "POST",
      }),
    })

    // Assert
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      id: "job-1",
      status: "run_now_scheduled",
    })
  })

  it("maps run-now conflicts", async () => {
    // Arrange
    const action = createApiJobRunNowAction({
      runNow: async () => {
        throw new OttoExternalApiError("state conflict", 409)
      },
    })

    // Act
    const response = await action({
      params: {
        jobId: "job-1",
      },
      request: new Request("http://localhost/api/jobs/job-1/run-now", {
        method: "POST",
      }),
    })

    // Assert
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({
      error: "state_conflict",
    })
  })

  it("rejects non-post methods", async () => {
    // Arrange
    const action = createApiJobRunNowAction({
      runNow: async () => {
        throw new Error("should not run")
      },
    })

    // Act
    const response = await action({
      params: {
        jobId: "job-1",
      },
      request: new Request("http://localhost/api/jobs/job-1/run-now", {
        method: "GET",
      }),
    })

    // Assert
    expect(response.status).toBe(405)
  })
})
