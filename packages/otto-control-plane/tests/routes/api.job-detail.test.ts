import { describe, expect, it } from "vitest"

import {
  createApiJobDetailAction,
  createApiJobDetailLoader,
} from "../../app/server/api-job-detail-route.server.js"
import type { ExternalJobResponse } from "../../app/features/jobs/contracts.js"
import { OttoExternalApiError } from "../../app/server/otto-external-api.server.js"

const sampleJobResponse: ExternalJobResponse = {
  job: {
    id: "job-1",
    type: "heartbeat",
    status: "idle",
    scheduleType: "recurring",
    profileId: null,
    modelRef: null,
    runAt: null,
    cadenceMinutes: 5,
    payload: null,
    lastRunAt: null,
    nextRunAt: 1_000,
    terminalState: null,
    terminalReason: null,
    lockToken: null,
    lockExpiresAt: null,
    createdAt: 100,
    updatedAt: 100,
    managedBy: "operator",
    isMutable: true,
  },
}

describe("api.job-detail loader", () => {
  it("returns 200 with job payload", async () => {
    // Arrange
    const loader = createApiJobDetailLoader({
      loadJob: async () => {
        return sampleJobResponse
      },
      updateJob: async () => {
        throw new Error("unused in loader test")
      },
      deleteJob: async () => {
        throw new Error("unused in loader test")
      },
      cancelBackgroundJob: async () => {
        throw new Error("unused in loader test")
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
    expect(await response.json()).toEqual(sampleJobResponse)
  })

  it("returns 404 when runtime reports unknown job", async () => {
    // Arrange
    const loader = createApiJobDetailLoader({
      loadJob: async () => {
        throw new OttoExternalApiError("not found", 404)
      },
      updateJob: async () => {
        throw new Error("unused in loader test")
      },
      deleteJob: async () => {
        throw new Error("unused in loader test")
      },
      cancelBackgroundJob: async () => {
        throw new Error("unused in loader test")
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

describe("api.job-detail action", () => {
  it("updates a mutable job via PATCH", async () => {
    // Arrange
    const action = createApiJobDetailAction({
      loadJob: async () => {
        throw new Error("unused in action test")
      },
      updateJob: async (jobId, input) => {
        expect(jobId).toBe("job-1")
        expect(input).toMatchObject({
          type: "operator-task",
          scheduleType: "recurring",
          cadenceMinutes: 15,
        })

        return {
          id: "job-1",
          status: "updated",
        }
      },
      deleteJob: async () => {
        throw new Error("unused in patch test")
      },
      cancelBackgroundJob: async () => {
        throw new Error("unused in patch test")
      },
    })

    // Act
    const response = await action({
      params: {
        jobId: "job-1",
      },
      request: new Request("http://localhost/api/jobs/job-1", {
        method: "PATCH",
        body: JSON.stringify({
          type: "operator-task",
          scheduleType: "recurring",
          cadenceMinutes: 15,
        }),
      }),
    })

    // Assert
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      id: "job-1",
      status: "updated",
    })
  })

  it("cancels a job via DELETE", async () => {
    // Arrange
    const action = createApiJobDetailAction({
      loadJob: async () => {
        return sampleJobResponse
      },
      updateJob: async () => {
        throw new Error("unused in delete test")
      },
      deleteJob: async (jobId, reason) => {
        expect(jobId).toBe("job-1")
        expect(reason).toBe("Operator cancelled")

        return {
          id: "job-1",
          status: "deleted",
        }
      },
      cancelBackgroundJob: async () => {
        throw new Error("unused in delete test")
      },
    })

    // Act
    const response = await action({
      params: {
        jobId: "job-1",
      },
      request: new Request("http://localhost/api/jobs/job-1", {
        method: "DELETE",
        body: JSON.stringify({ reason: "Operator cancelled" }),
      }),
    })

    // Assert
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      id: "job-1",
      status: "deleted",
    })
  })

  it("rejects unsupported methods", async () => {
    // Arrange
    const action = createApiJobDetailAction({
      loadJob: async () => {
        throw new Error("unused in action test")
      },
      updateJob: async () => {
        throw new Error("should not run")
      },
      deleteJob: async () => {
        throw new Error("should not run")
      },
      cancelBackgroundJob: async () => {
        throw new Error("should not run")
      },
    })

    // Act
    const response = await action({
      params: {
        jobId: "job-1",
      },
      request: new Request("http://localhost/api/jobs/job-1", {
        method: "POST",
      }),
    })

    // Assert
    expect(response.status).toBe(405)
  })

  it("rejects system-reserved type updates before upstream call", async () => {
    // Arrange
    let updateCallCount = 0
    const action = createApiJobDetailAction({
      loadJob: async () => {
        throw new Error("unused in action test")
      },
      updateJob: async () => {
        updateCallCount += 1
        throw new Error("should not run")
      },
      deleteJob: async () => {
        throw new Error("unused in update test")
      },
      cancelBackgroundJob: async () => {
        throw new Error("unused in update test")
      },
    })

    // Act
    const response = await action({
      params: {
        jobId: "job-1",
      },
      request: new Request("http://localhost/api/jobs/job-1", {
        method: "PATCH",
        body: JSON.stringify({
          type: "heartbeat",
        }),
      }),
    })
    const body = await response.json()

    // Assert
    expect(response.status).toBe(403)
    expect(body).toMatchObject({
      error: "forbidden_mutation",
    })
    expect(updateCallCount).toBe(0)
  })

  it("routes DELETE to background cancel semantics for interactive background jobs", async () => {
    // Arrange
    let deleteCallCount = 0
    const action = createApiJobDetailAction({
      loadJob: async () => {
        return {
          ...sampleJobResponse,
          job: {
            ...sampleJobResponse.job,
            type: "interactive_background_oneshot",
          },
        }
      },
      updateJob: async () => {
        throw new Error("unused in background cancel test")
      },
      deleteJob: async () => {
        deleteCallCount += 1
        throw new Error("should not run")
      },
      cancelBackgroundJob: async (jobId, reason) => {
        expect(jobId).toBe("job-1")
        expect(reason).toBe("Operator cancelled")

        return {
          jobId,
          outcome: "cancelled",
          terminalState: "cancelled",
          stopSessionResults: [],
        }
      },
    })

    // Act
    const response = await action({
      params: {
        jobId: "job-1",
      },
      request: new Request("http://localhost/api/jobs/job-1", {
        method: "DELETE",
        body: JSON.stringify({ reason: "Operator cancelled" }),
      }),
    })

    // Assert
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      jobId: "job-1",
      outcome: "cancelled",
      terminalState: "cancelled",
      stopSessionResults: [],
    })
    expect(deleteCallCount).toBe(0)
  })
})
