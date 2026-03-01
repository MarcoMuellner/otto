import { describe, expect, it } from "vitest"

import { createApiJobRunsLoader } from "../../app/server/api-job-runs-route.server.js"
import { OttoExternalApiError } from "../../app/server/otto-external-api.server.js"

describe("api.job-runs loader", () => {
  it("returns 200 with paginated run payload", async () => {
    // Arrange
    const loader = createApiJobRunsLoader({
      loadJobRuns: async (jobId, limit, offset) => {
        expect(jobId).toBe("job-1")
        expect(limit).toBe(10)
        expect(offset).toBe(20)

        return {
          taskId: "job-1",
          total: 44,
          limit: 10,
          offset: 20,
          runs: [
            {
              id: "run-21",
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
          ],
        }
      },
    })

    // Act
    const response = await loader({
      params: {
        jobId: "job-1",
      },
      request: new Request("http://localhost/api/jobs/job-1/runs?limit=10&offset=20"),
    })

    // Assert
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      taskId: "job-1",
      total: 44,
      runs: [{ id: "run-21" }],
    })
  })

  it("returns 404 when runtime reports missing job", async () => {
    // Arrange
    const loader = createApiJobRunsLoader({
      loadJobRuns: async () => {
        throw new OttoExternalApiError("not found", 404)
      },
    })

    // Act
    const response = await loader({
      params: {
        jobId: "missing",
      },
      request: new Request("http://localhost/api/jobs/missing/runs"),
    })

    // Assert
    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({
      error: "not_found",
    })
  })
})
