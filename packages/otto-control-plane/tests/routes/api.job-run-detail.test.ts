import { describe, expect, it } from "vitest"

import { createApiJobRunDetailLoader } from "../../app/server/api-job-run-detail-route.server.js"
import { OttoExternalApiError } from "../../app/server/otto-external-api.server.js"

describe("api.job-run-detail loader", () => {
  it("returns 200 with run detail payload", async () => {
    // Arrange
    const loader = createApiJobRunDetailLoader({
      loadJobRun: async (jobId, runId) => {
        expect(jobId).toBe("job-1")
        expect(runId).toBe("run-1")

        return {
          taskId: "job-1",
          run: {
            id: "run-1",
            jobId: "job-1",
            scheduledFor: 2_000,
            startedAt: 2_001,
            finishedAt: 2_010,
            status: "success",
            errorCode: null,
            errorMessage: null,
            resultJson: '{"status":"success","summary":"done","errors":[]}',
            promptProvenance: null,
            createdAt: 2_001,
          },
        }
      },
    })

    // Act
    const response = await loader({
      params: {
        jobId: "job-1",
        runId: "run-1",
      },
    })

    // Assert
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      taskId: "job-1",
      run: { id: "run-1" },
    })
  })

  it("returns 404 when runtime reports missing run", async () => {
    // Arrange
    const loader = createApiJobRunDetailLoader({
      loadJobRun: async () => {
        throw new OttoExternalApiError("not found", 404)
      },
    })

    // Act
    const response = await loader({
      params: {
        jobId: "job-1",
        runId: "missing-run",
      },
    })

    // Assert
    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({
      error: "not_found",
    })
  })
})
