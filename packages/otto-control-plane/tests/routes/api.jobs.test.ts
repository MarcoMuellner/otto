import { describe, expect, it } from "vitest"

import { createApiJobsAction, createApiJobsLoader } from "../../app/server/api-jobs-route.server.js"
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
              modelRef: null,
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
      createJob: async () => {
        throw new Error("unused in loader test")
      },
    })

    // Act
    const response = await loader({
      request: new Request("http://localhost/api/jobs"),
    })
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
      createJob: async () => {
        throw new Error("unused in loader test")
      },
    })

    // Act
    const response = await loader({
      request: new Request("http://localhost/api/jobs"),
    })
    const body = await response.json()

    // Assert
    expect(response.status).toBe(503)
    expect(body).toMatchObject({
      error: "runtime_unavailable",
    })
  })

  it("forwards optional lane/type query filters", async () => {
    // Arrange
    const loader = createApiJobsLoader({
      loadJobs: async (input) => {
        expect(input).toEqual({
          lane: "interactive",
          type: "interactive_background_oneshot",
        })

        return {
          jobs: [],
        }
      },
      createJob: async () => {
        throw new Error("unused in loader test")
      },
    })

    // Act
    const response = await loader({
      request: new Request(
        "http://localhost/api/jobs?lane=interactive&type=interactive_background_oneshot"
      ),
    })

    // Assert
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ jobs: [] })
  })
})

describe("api.jobs action", () => {
  it("creates a job with validated payload", async () => {
    // Arrange
    const action = createApiJobsAction({
      loadJobs: async () => {
        throw new Error("unused in action test")
      },
      createJob: async (input) => {
        expect(input).toMatchObject({
          type: "operator-task",
          scheduleType: "recurring",
          cadenceMinutes: 10,
        })

        return {
          id: "operator-job-1",
          status: "created",
        }
      },
    })

    // Act
    const response = await action({
      request: new Request("http://localhost/api/jobs", {
        method: "POST",
        body: JSON.stringify({
          type: "operator-task",
          scheduleType: "recurring",
          cadenceMinutes: 10,
        }),
      }),
    })
    const body = await response.json()

    // Assert
    expect(response.status).toBe(201)
    expect(body).toEqual({
      id: "operator-job-1",
      status: "created",
    })
  })

  it("rejects non-post methods", async () => {
    // Arrange
    const action = createApiJobsAction({
      loadJobs: async () => {
        throw new Error("unused in action test")
      },
      createJob: async () => {
        throw new Error("should not run")
      },
    })

    // Act
    const response = await action({
      request: new Request("http://localhost/api/jobs", {
        method: "GET",
      }),
    })

    // Assert
    expect(response.status).toBe(405)
  })

  it("maps forbidden mutation errors", async () => {
    // Arrange
    const action = createApiJobsAction({
      loadJobs: async () => {
        throw new Error("unused in action test")
      },
      createJob: async () => {
        throw new OttoExternalApiError("forbidden", 403)
      },
    })

    // Act
    const response = await action({
      request: new Request("http://localhost/api/jobs", {
        method: "POST",
        body: JSON.stringify({
          type: "operator-task",
          scheduleType: "recurring",
          cadenceMinutes: 10,
        }),
      }),
    })
    const body = await response.json()

    // Assert
    expect(response.status).toBe(403)
    expect(body).toMatchObject({
      error: "forbidden_mutation",
    })
  })

  it("rejects system-reserved type creation before upstream call", async () => {
    // Arrange
    let createCallCount = 0
    const action = createApiJobsAction({
      loadJobs: async () => {
        throw new Error("unused in action test")
      },
      createJob: async () => {
        createCallCount += 1
        throw new Error("should not run")
      },
    })

    // Act
    const response = await action({
      request: new Request("http://localhost/api/jobs", {
        method: "POST",
        body: JSON.stringify({
          type: "heartbeat",
          scheduleType: "recurring",
          cadenceMinutes: 10,
        }),
      }),
    })
    const body = await response.json()

    // Assert
    expect(response.status).toBe(403)
    expect(body).toMatchObject({
      error: "forbidden_mutation",
    })
    expect(createCallCount).toBe(0)
  })
})
