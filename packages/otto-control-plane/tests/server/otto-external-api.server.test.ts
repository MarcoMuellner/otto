import { describe, expect, it } from "vitest"

import {
  createOttoExternalApiClient,
  OttoExternalApiError,
} from "../../app/server/otto-external-api.server.js"

const resolveAuthorizationHeader = (headers: HeadersInit | undefined): string | null => {
  if (!headers) {
    return null
  }

  if (headers instanceof Headers) {
    return headers.get("authorization")
  }

  if (Array.isArray(headers)) {
    const found = headers.find(([key]) => key.toLowerCase() === "authorization")
    return found ? found[1] : null
  }

  const direct = headers.authorization
  if (typeof direct === "string") {
    return direct
  }

  const upper = headers.Authorization
  return typeof upper === "string" ? upper : null
}

describe("createOttoExternalApiClient", () => {
  const createListItem = () => {
    return {
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
    }
  }

  it("sends bearer token on health requests", async () => {
    // Arrange
    const seenRequests: Array<{ url: string; authorization: string | null }> = []

    const client = createOttoExternalApiClient({
      config: {
        externalApiBaseUrl: "http://127.0.0.1:4190",
        externalApiToken: "secret-token",
      },
      fetchImpl: async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const requestUrl = typeof input === "string" ? input : input.toString()
        const authorization = resolveAuthorizationHeader(init?.headers)

        seenRequests.push({ url: requestUrl, authorization })

        return Response.json({ status: "ok" }, { status: 200 })
      },
    })

    // Act
    await client.getHealth()

    // Assert
    expect(seenRequests).toEqual([
      {
        url: "http://127.0.0.1:4190/external/health",
        authorization: "Bearer secret-token",
      },
    ])
  })

  it("returns jobs payload for jobs endpoint", async () => {
    // Arrange
    const client = createOttoExternalApiClient({
      config: {
        externalApiBaseUrl: "http://127.0.0.1:4190",
        externalApiToken: "secret-token",
      },
      fetchImpl: async (): Promise<Response> => {
        return Response.json({ jobs: [createListItem()] }, { status: 200 })
      },
    })

    // Act
    const payload = await client.listJobs()

    // Assert
    expect(payload).toEqual({ jobs: [createListItem()] })
  })

  it("returns system status payload", async () => {
    // Arrange
    const client = createOttoExternalApiClient({
      config: {
        externalApiBaseUrl: "http://127.0.0.1:4190",
        externalApiToken: "secret-token",
      },
      fetchImpl: async (): Promise<Response> => {
        return Response.json(
          {
            status: "ok",
            checkedAt: 1_700_000_000_000,
            runtime: {
              version: "0.1.0-dev",
              pid: 1234,
              startedAt: 1_699_999_999_000,
              uptimeSec: 42,
            },
            services: [
              {
                id: "runtime",
                label: "Otto Runtime",
                status: "ok",
                message: "Runtime process is active",
              },
            ],
          },
          { status: 200 }
        )
      },
    })

    // Act
    const payload = await client.getSystemStatus()

    // Assert
    expect(payload).toMatchObject({
      status: "ok",
      runtime: { version: "0.1.0-dev" },
    })
  })

  it("posts restart system request", async () => {
    // Arrange
    const seenRequests: Array<{ url: string; method: string }> = []

    const client = createOttoExternalApiClient({
      config: {
        externalApiBaseUrl: "http://127.0.0.1:4190",
        externalApiToken: "secret-token",
      },
      fetchImpl: async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        seenRequests.push({
          url: typeof input === "string" ? input : input.toString(),
          method: init?.method ?? "GET",
        })

        return Response.json(
          {
            status: "accepted",
            requestedAt: 1_700_000_000_000,
            message: "Runtime restart requested",
          },
          { status: 202 }
        )
      },
    })

    // Act
    const payload = await client.restartSystem()

    // Assert
    expect(payload.status).toBe("accepted")
    expect(seenRequests).toEqual([
      {
        url: "http://127.0.0.1:4190/external/system/restart",
        method: "POST",
      },
    ])
  })

  it("gets and updates notification profile settings", async () => {
    // Arrange
    const seenRequests: Array<{ url: string; method: string; bodyText: string | null }> = []
    const client = createOttoExternalApiClient({
      config: {
        externalApiBaseUrl: "http://127.0.0.1:4190",
        externalApiToken: "secret-token",
      },
      fetchImpl: async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = typeof input === "string" ? input : input.toString()
        const method = init?.method ?? "GET"
        seenRequests.push({
          url,
          method,
          bodyText: typeof init?.body === "string" ? init.body : null,
        })

        if (method === "GET") {
          return Response.json(
            {
              profile: {
                timezone: "Europe/Vienna",
                quietHoursStart: "21:00",
                quietHoursEnd: "07:30",
                quietMode: "critical_only",
                muteUntil: null,
                heartbeatMorning: "08:30",
                heartbeatMidday: "12:30",
                heartbeatEvening: "19:00",
                heartbeatCadenceMinutes: 180,
                heartbeatOnlyIfSignal: true,
                onboardingCompletedAt: null,
                lastDigestAt: null,
                updatedAt: 1_000,
              },
            },
            { status: 200 }
          )
        }

        return Response.json(
          {
            profile: {
              timezone: "Europe/Vienna",
              quietHoursStart: "22:00",
              quietHoursEnd: "07:00",
              quietMode: "critical_only",
              muteUntil: null,
              heartbeatMorning: "08:30",
              heartbeatMidday: "12:30",
              heartbeatEvening: "19:00",
              heartbeatCadenceMinutes: 180,
              heartbeatOnlyIfSignal: true,
              onboardingCompletedAt: null,
              lastDigestAt: null,
              updatedAt: 2_000,
            },
            changedFields: ["quietHoursStart", "quietHoursEnd", "updatedAt"],
          },
          { status: 200 }
        )
      },
    })

    // Act
    const getResult = await client.getNotificationProfile()
    const updateResult = await client.updateNotificationProfile({
      timezone: "Europe/Vienna",
      quietHoursStart: "22:00",
      quietHoursEnd: "07:00",
    })

    // Assert
    expect(getResult.profile.quietHoursStart).toBe("21:00")
    expect(updateResult.profile.quietHoursStart).toBe("22:00")
    expect(seenRequests).toMatchObject([
      {
        url: "http://127.0.0.1:4190/external/settings/notification-profile",
        method: "GET",
      },
      {
        url: "http://127.0.0.1:4190/external/settings/notification-profile",
        method: "PUT",
      },
    ])
    expect(seenRequests[1]?.bodyText).toContain("quietHoursStart")
  })

  it("gets, refreshes, and updates model management endpoints", async () => {
    // Arrange
    const seenRequests: Array<{ url: string; method: string; bodyText: string | null }> = []
    const client = createOttoExternalApiClient({
      config: {
        externalApiBaseUrl: "http://127.0.0.1:4190",
        externalApiToken: "secret-token",
      },
      fetchImpl: async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = typeof input === "string" ? input : input.toString()
        const method = init?.method ?? "GET"
        seenRequests.push({
          url,
          method,
          bodyText: typeof init?.body === "string" ? init.body : null,
        })

        if (url.endsWith("/external/models/catalog")) {
          return Response.json(
            {
              models: ["openai/gpt-5.3-codex", "anthropic/claude-sonnet-4"],
              updatedAt: 1_700_000_000_000,
              source: "network",
            },
            { status: 200 }
          )
        }

        if (url.endsWith("/external/models/refresh")) {
          return Response.json(
            {
              status: "ok",
              updatedAt: 1_700_000_001_000,
              count: 2,
            },
            { status: 200 }
          )
        }

        if (url.endsWith("/external/models/defaults") && method === "GET") {
          return Response.json(
            {
              flowDefaults: {
                interactiveAssistant: "openai/gpt-5.3-codex",
                scheduledTasks: null,
                heartbeat: null,
                watchdogFailures: null,
              },
            },
            { status: 200 }
          )
        }

        return Response.json(
          {
            flowDefaults: {
              interactiveAssistant: "openai/gpt-5.3-codex",
              scheduledTasks: "anthropic/claude-sonnet-4",
              heartbeat: null,
              watchdogFailures: null,
            },
          },
          { status: 200 }
        )
      },
    })

    // Act
    const catalog = await client.getModelCatalog()
    const refresh = await client.refreshModelCatalog()
    const defaults = await client.getModelDefaults()
    const updated = await client.updateModelDefaults({
      flowDefaults: {
        ...defaults.flowDefaults,
        scheduledTasks: "anthropic/claude-sonnet-4",
      },
    })

    // Assert
    expect(catalog.models).toContain("openai/gpt-5.3-codex")
    expect(refresh).toMatchObject({ status: "ok", count: 2 })
    expect(updated.flowDefaults.scheduledTasks).toBe("anthropic/claude-sonnet-4")
    expect(seenRequests).toMatchObject([
      { url: "http://127.0.0.1:4190/external/models/catalog", method: "GET" },
      { url: "http://127.0.0.1:4190/external/models/refresh", method: "POST" },
      { url: "http://127.0.0.1:4190/external/models/defaults", method: "GET" },
      { url: "http://127.0.0.1:4190/external/models/defaults", method: "PUT" },
    ])
    expect(seenRequests[3]?.bodyText).toContain("scheduledTasks")
  })

  it("throws OttoExternalApiError on non-2xx responses", async () => {
    // Arrange
    const client = createOttoExternalApiClient({
      config: {
        externalApiBaseUrl: "http://127.0.0.1:4190",
        externalApiToken: "secret-token",
      },
      fetchImpl: async (): Promise<Response> => {
        return Response.json({ error: "unauthorized" }, { status: 401 })
      },
    })

    // Act + Assert
    await expect(client.getHealth()).rejects.toBeInstanceOf(OttoExternalApiError)
  })

  it("fetches job details, audit, and run payloads", async () => {
    // Arrange
    const responses = new Map<string, Response>([
      [
        "http://127.0.0.1:4190/external/jobs/job-1",
        Response.json(
          {
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
              createdAt: 1_000,
              updatedAt: 1_000,
              managedBy: "system",
              isMutable: false,
            },
          },
          { status: 200 }
        ),
      ],
      [
        "http://127.0.0.1:4190/external/jobs/job-1/audit?limit=25",
        Response.json(
          {
            taskId: "job-1",
            entries: [
              {
                id: "audit-1",
                taskId: "job-1",
                action: "update",
                lane: "scheduled",
                actor: "system",
                metadataJson: "{}",
                createdAt: 2_000,
              },
            ],
          },
          { status: 200 }
        ),
      ],
      [
        "http://127.0.0.1:4190/external/jobs/job-1/runs?limit=10&offset=20",
        Response.json(
          {
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
                createdAt: 2_001,
              },
            ],
          },
          { status: 200 }
        ),
      ],
      [
        "http://127.0.0.1:4190/external/jobs/job-1/runs/run-21",
        Response.json(
          {
            taskId: "job-1",
            run: {
              id: "run-21",
              jobId: "job-1",
              scheduledFor: 2_000,
              startedAt: 2_001,
              finishedAt: 2_010,
              status: "success",
              errorCode: null,
              errorMessage: null,
              resultJson: '{"status":"success","summary":"done","errors":[]}',
              createdAt: 2_001,
            },
          },
          { status: 200 }
        ),
      ],
    ])

    const client = createOttoExternalApiClient({
      config: {
        externalApiBaseUrl: "http://127.0.0.1:4190",
        externalApiToken: "secret-token",
      },
      fetchImpl: async (input: RequestInfo | URL): Promise<Response> => {
        const key = typeof input === "string" ? input : input.toString()
        const response = responses.get(key)
        if (!response) {
          return Response.json({ error: "not_found" }, { status: 404 })
        }

        return response
      },
    })

    // Act
    const detail = await client.getJob("job-1")
    const audit = await client.getJobAudit("job-1", 25)
    const runs = await client.getJobRuns("job-1", { limit: 10, offset: 20 })
    const run = await client.getJobRun("job-1", "run-21")

    // Assert
    expect(detail.job.id).toBe("job-1")
    expect(audit.taskId).toBe("job-1")
    expect(audit.entries[0]?.id).toBe("audit-1")
    expect(runs.total).toBe(44)
    expect(runs.runs[0]?.id).toBe("run-21")
    expect(run.run.id).toBe("run-21")
  })

  it("sends mutation requests with method, auth, and json body", async () => {
    // Arrange
    const seenRequests: Array<{
      url: string
      method: string
      authorization: string | null
      contentType: string | null
      bodyText: string | null
    }> = []

    const successBody = {
      id: "job-1",
      status: "updated",
    }

    const client = createOttoExternalApiClient({
      config: {
        externalApiBaseUrl: "http://127.0.0.1:4190",
        externalApiToken: "secret-token",
      },
      fetchImpl: async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        seenRequests.push({
          url: typeof input === "string" ? input : input.toString(),
          method: init?.method ?? "GET",
          authorization: resolveAuthorizationHeader(init?.headers),
          contentType: (() => {
            if (!init?.headers) {
              return null
            }

            if (init.headers instanceof Headers) {
              return init.headers.get("content-type")
            }

            if (Array.isArray(init.headers)) {
              const found = init.headers.find(([key]) => key.toLowerCase() === "content-type")
              return found ? found[1] : null
            }

            const headerRecord = init.headers as Record<string, string | undefined>
            return headerRecord["content-type"] ?? headerRecord["Content-Type"] ?? null
          })(),
          bodyText: typeof init?.body === "string" ? init.body : null,
        })

        return Response.json(successBody, { status: 200 })
      },
    })

    // Act
    await client.createJob({
      type: "operator task",
      scheduleType: "oneshot",
      runAt: 1_000,
    })

    await client.updateJob("job-1", {
      type: "updated",
    })

    await client.deleteJob("job-1", {
      reason: "no longer needed",
    })

    await client.runJobNow("job-1")

    // Assert
    expect(seenRequests).toHaveLength(4)
    expect(seenRequests[0]).toMatchObject({
      url: "http://127.0.0.1:4190/external/jobs",
      method: "POST",
      authorization: "Bearer secret-token",
      contentType: "application/json",
    })
    expect(seenRequests[1]).toMatchObject({
      url: "http://127.0.0.1:4190/external/jobs/job-1",
      method: "PATCH",
      authorization: "Bearer secret-token",
      contentType: "application/json",
    })
    expect(seenRequests[2]).toMatchObject({
      url: "http://127.0.0.1:4190/external/jobs/job-1",
      method: "DELETE",
      authorization: "Bearer secret-token",
      contentType: "application/json",
    })
    expect(seenRequests[3]).toMatchObject({
      url: "http://127.0.0.1:4190/external/jobs/job-1/run-now",
      method: "POST",
      authorization: "Bearer secret-token",
      contentType: null,
    })
  })
})
