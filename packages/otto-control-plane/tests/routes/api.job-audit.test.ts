import { describe, expect, it } from "vitest"

import { createApiJobAuditLoader } from "../../app/server/api-job-audit-route.server.js"
import { OttoExternalApiError } from "../../app/server/otto-external-api.server.js"

describe("api.job-audit loader", () => {
  it("returns 200 with audit payload", async () => {
    // Arrange
    const loader = createApiJobAuditLoader({
      loadJobAudit: async () => {
        return {
          taskId: "job-1",
          entries: [{ id: "audit-1" }],
        }
      },
    })

    // Act
    const response = await loader({
      params: {
        jobId: "job-1",
      },
      request: new Request("http://localhost/api/jobs/job-1/audit?limit=10"),
    })

    // Assert
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      taskId: "job-1",
      entries: [{ id: "audit-1" }],
    })
  })

  it("returns 503 when runtime is unavailable", async () => {
    // Arrange
    const loader = createApiJobAuditLoader({
      loadJobAudit: async () => {
        throw new OttoExternalApiError("upstream unavailable", 503)
      },
    })

    // Act
    const response = await loader({
      params: {
        jobId: "job-1",
      },
      request: new Request("http://localhost/api/jobs/job-1/audit"),
    })

    // Assert
    expect(response.status).toBe(503)
  })
})
