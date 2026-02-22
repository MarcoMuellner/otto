import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import pino from "pino"
import { afterEach, describe, expect, it } from "vitest"

import { buildExternalApiServer, resolveExternalApiConfig } from "../../src/external-api/server.js"
import type {
  CommandAuditRecord,
  JobRecord,
  JobRunRecord,
  TaskAuditRecord,
  TaskListRecord,
  UserProfileRecord,
} from "../../src/persistence/repositories.js"

const TEMP_PREFIX = path.join(tmpdir(), "otto-external-api-")
const cleanupPaths: string[] = []

afterEach(async () => {
  await Promise.all(
    cleanupPaths.splice(0).map(async (directory) => rm(directory, { recursive: true, force: true }))
  )
})

const createTaskListRecord = (id: string): TaskListRecord => {
  return {
    id,
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
  }
}

const createJobRecord = (id: string): JobRecord => {
  return {
    id,
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
  }
}

const createTaskAuditRecord = (taskId: string): TaskAuditRecord => {
  return {
    id: "audit-1",
    taskId,
    action: "update",
    lane: "scheduled",
    actor: "system",
    beforeJson: null,
    afterJson: null,
    metadataJson: "{}",
    createdAt: 2_000,
  }
}

const createJobRunRecord = (jobId: string, runId = "run-1"): JobRunRecord => {
  return {
    id: runId,
    jobId,
    scheduledFor: 1_000,
    startedAt: 1_001,
    finishedAt: 1_005,
    status: "success",
    errorCode: null,
    errorMessage: null,
    resultJson: '{"status":"success","summary":"ok","errors":[]}',
    createdAt: 1_001,
  }
}

type JobsRepositoryStub = {
  listTasks: () => TaskListRecord[]
  getById: (jobId: string) => JobRecord | null
  listRunsByJobId: (
    jobId: string,
    options?: {
      limit?: number
      offset?: number
    }
  ) => JobRunRecord[]
  countRunsByJobId: (jobId: string) => number
  getRunById: (jobId: string, runId: string) => JobRunRecord | null
  createTask: (record: JobRecord) => void
  updateTask: (
    jobId: string,
    update: {
      type: string
      scheduleType: "recurring" | "oneshot"
      profileId: string | null
      modelRef: string | null
      runAt: number | null
      cadenceMinutes: number | null
      payload: string | null
      nextRunAt: number | null
    },
    updatedAt?: number
  ) => void
  cancelTask: (jobId: string, reason: string | null, updatedAt?: number) => void
  runTaskNow: (jobId: string, scheduledFor: number, updatedAt?: number) => void
}

type TaskAuditRepositoryStub = {
  listByTaskId: (taskId: string, limit?: number) => TaskAuditRecord[]
  insert: (record: TaskAuditRecord) => void
}

type CommandAuditRepositoryStub = {
  insert: (record: CommandAuditRecord) => void
}

type UserProfileRepositoryStub = {
  get: () => UserProfileRecord | null
  upsert: (record: UserProfileRecord) => void
}

type ModelManagementStub = {
  getCatalogSnapshot: () => {
    refs: string[]
    updatedAt: number | null
    source: "network" | "cache"
  }
  refreshCatalog: () => Promise<{
    refs: string[]
    updatedAt: number | null
    source: "network" | "cache"
  }>
  getFlowDefaults: () => Promise<{
    interactiveAssistant: string | null
    scheduledTasks: string | null
    heartbeat: string | null
    watchdogFailures: string | null
  }>
  updateFlowDefaults: (flowDefaults: {
    interactiveAssistant: string | null
    scheduledTasks: string | null
    heartbeat: string | null
    watchdogFailures: string | null
  }) => Promise<{
    interactiveAssistant: string | null
    scheduledTasks: string | null
    heartbeat: string | null
    watchdogFailures: string | null
  }>
}

const createJobsRepositoryStub = (
  overrides: Partial<JobsRepositoryStub> = {}
): JobsRepositoryStub => {
  return {
    listTasks: () => [],
    getById: () => null,
    listRunsByJobId: () => [],
    countRunsByJobId: () => 0,
    getRunById: () => null,
    createTask: () => {
      return
    },
    updateTask: () => {
      return
    },
    cancelTask: () => {
      return
    },
    runTaskNow: () => {
      return
    },
    ...overrides,
  }
}

const createTaskAuditRepositoryStub = (
  overrides: Partial<TaskAuditRepositoryStub> = {}
): TaskAuditRepositoryStub => {
  return {
    listByTaskId: () => [],
    insert: () => {
      return
    },
    ...overrides,
  }
}

const createCommandAuditRepositoryStub = (
  overrides: Partial<CommandAuditRepositoryStub> = {}
): CommandAuditRepositoryStub => {
  return {
    insert: () => {
      return
    },
    ...overrides,
  }
}

const createUserProfileRepositoryStub = (
  overrides: Partial<UserProfileRepositoryStub> = {}
): UserProfileRepositoryStub => {
  let profile: UserProfileRecord | null = null

  return {
    get: () => profile,
    upsert: (record: UserProfileRecord): void => {
      profile = record
    },
    ...overrides,
  }
}

const createModelManagementStub = (
  overrides: Partial<ModelManagementStub> = {}
): ModelManagementStub => {
  return {
    getCatalogSnapshot: () => ({
      refs: ["openai/gpt-5.3-codex"],
      updatedAt: 1_000,
      source: "cache",
    }),
    refreshCatalog: async () => ({
      refs: ["openai/gpt-5.3-codex"],
      updatedAt: 2_000,
      source: "network",
    }),
    getFlowDefaults: async () => ({
      interactiveAssistant: null,
      scheduledTasks: "openai/gpt-5.3-codex",
      heartbeat: null,
      watchdogFailures: null,
    }),
    updateFlowDefaults: async (flowDefaults) => flowDefaults,
    ...overrides,
  }
}

describe("resolveExternalApiConfig", () => {
  it("creates and reuses the persisted API token file", async () => {
    // Arrange
    const homeDirectory = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(homeDirectory)

    // Act
    const first = await resolveExternalApiConfig(homeDirectory, {})
    const second = await resolveExternalApiConfig(homeDirectory, {})

    // Assert
    expect(first.token).toBe(second.token)
    const persisted = await readFile(first.tokenPath, "utf8")
    expect(persisted.trim()).toBe(first.token)
  })
})

describe("buildExternalApiServer", () => {
  it("returns unauthorized when token is missing", async () => {
    // Arrange
    const app = buildExternalApiServer({
      logger: pino({ enabled: false }),
      config: {
        host: "0.0.0.0",
        port: 4190,
        token: "secret",
        tokenPath: "/tmp/token",
        baseUrl: "http://0.0.0.0:4190",
      },
      jobsRepository: createJobsRepositoryStub(),
      taskAuditRepository: createTaskAuditRepositoryStub(),
    })

    // Act
    const response = await app.inject({
      method: "GET",
      url: "/external/health",
    })

    // Assert
    expect(response.statusCode).toBe(401)

    await app.close()
  })

  it("returns health status when authorized", async () => {
    // Arrange
    const app = buildExternalApiServer({
      logger: pino({ enabled: false }),
      config: {
        host: "0.0.0.0",
        port: 4190,
        token: "secret",
        tokenPath: "/tmp/token",
        baseUrl: "http://0.0.0.0:4190",
      },
      jobsRepository: createJobsRepositoryStub(),
      taskAuditRepository: createTaskAuditRepositoryStub(),
    })

    // Act
    const response = await app.inject({
      method: "GET",
      url: "/external/health",
      headers: {
        authorization: "Bearer secret",
      },
    })

    // Assert
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ status: "ok" })

    await app.close()
  })

  it("returns system status snapshot when authorized", async () => {
    // Arrange
    const app = buildExternalApiServer({
      logger: pino({ enabled: false }),
      config: {
        host: "0.0.0.0",
        port: 4190,
        token: "secret",
        tokenPath: "/tmp/token",
        baseUrl: "http://0.0.0.0:4190",
      },
      systemStatusProvider: () => {
        return {
          status: "degraded",
          checkedAt: 1_700_000_000_000,
          runtime: {
            version: "0.1.0-test",
            pid: 1234,
            startedAt: 1_699_999_999_000,
            uptimeSec: 12.5,
          },
          services: [
            {
              id: "runtime",
              label: "Otto Runtime",
              status: "ok",
              message: "Runtime process is active",
            },
            {
              id: "telegram_worker",
              label: "Telegram Worker",
              status: "degraded",
              message: "Telegram worker unavailable",
            },
          ],
        }
      },
      jobsRepository: createJobsRepositoryStub(),
      taskAuditRepository: createTaskAuditRepositoryStub(),
    })

    // Act
    const response = await app.inject({
      method: "GET",
      url: "/external/system/status",
      headers: {
        authorization: "Bearer secret",
      },
    })

    // Assert
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      status: "degraded",
      runtime: { version: "0.1.0-test" },
      services: [
        { id: "runtime", status: "ok" },
        { id: "telegram_worker", status: "degraded" },
      ],
    })

    await app.close()
  })

  it("accepts runtime restart and writes command audit", async () => {
    // Arrange
    let restartCallCount = 0
    const auditRecords: CommandAuditRecord[] = []
    const app = buildExternalApiServer({
      logger: pino({ enabled: false }),
      config: {
        host: "0.0.0.0",
        port: 4190,
        token: "secret",
        tokenPath: "/tmp/token",
        baseUrl: "http://0.0.0.0:4190",
      },
      restartRuntime: async () => {
        restartCallCount += 1
      },
      commandAuditRepository: createCommandAuditRepositoryStub({
        insert: (record: CommandAuditRecord): void => {
          auditRecords.push(record)
        },
      }),
      jobsRepository: createJobsRepositoryStub(),
      taskAuditRepository: createTaskAuditRepositoryStub(),
    })

    // Act
    const response = await app.inject({
      method: "POST",
      url: "/external/system/restart",
      headers: {
        authorization: "Bearer secret",
      },
    })

    // Assert
    expect(response.statusCode).toBe(202)
    expect(response.json()).toMatchObject({ status: "accepted" })
    expect(restartCallCount).toBe(1)
    expect(auditRecords[0]).toMatchObject({
      command: "external_system_restart",
      status: "success",
    })

    await app.close()
  })

  it("returns notification profile settings when authorized", async () => {
    // Arrange
    const profileRepository = createUserProfileRepositoryStub()
    profileRepository.upsert({
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
    })

    const app = buildExternalApiServer({
      logger: pino({ enabled: false }),
      config: {
        host: "0.0.0.0",
        port: 4190,
        token: "secret",
        tokenPath: "/tmp/token",
        baseUrl: "http://0.0.0.0:4190",
      },
      userProfileRepository: profileRepository,
      jobsRepository: createJobsRepositoryStub(),
      taskAuditRepository: createTaskAuditRepositoryStub(),
    })

    // Act
    const response = await app.inject({
      method: "GET",
      url: "/external/settings/notification-profile",
      headers: {
        authorization: "Bearer secret",
      },
    })

    // Assert
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      profile: {
        timezone: "Europe/Vienna",
        quietHoursStart: "21:00",
      },
    })

    await app.close()
  })

  it("updates notification profile settings and writes audit metadata", async () => {
    // Arrange
    const auditRecords: CommandAuditRecord[] = []
    const profileRepository = createUserProfileRepositoryStub()
    const app = buildExternalApiServer({
      logger: pino({ enabled: false }),
      config: {
        host: "0.0.0.0",
        port: 4190,
        token: "secret",
        tokenPath: "/tmp/token",
        baseUrl: "http://0.0.0.0:4190",
      },
      userProfileRepository: profileRepository,
      commandAuditRepository: createCommandAuditRepositoryStub({
        insert: (record: CommandAuditRecord): void => {
          auditRecords.push(record)
        },
      }),
      jobsRepository: createJobsRepositoryStub(),
      taskAuditRepository: createTaskAuditRepositoryStub(),
    })

    // Act
    const response = await app.inject({
      method: "PUT",
      url: "/external/settings/notification-profile",
      headers: {
        authorization: "Bearer secret",
      },
      payload: {
        timezone: "Europe/Vienna",
        quietHoursStart: "22:00",
        quietHoursEnd: "07:00",
      },
    })

    // Assert
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      profile: {
        quietHoursStart: "22:00",
        quietHoursEnd: "07:00",
      },
      changedFields: expect.arrayContaining(["quietHoursStart", "quietHoursEnd"]),
    })
    expect(auditRecords[0]).toMatchObject({
      command: "set_notification_policy",
      status: "success",
      lane: "interactive",
    })

    await app.close()
  })

  it("rejects invalid notification profile updates", async () => {
    // Arrange
    const app = buildExternalApiServer({
      logger: pino({ enabled: false }),
      config: {
        host: "0.0.0.0",
        port: 4190,
        token: "secret",
        tokenPath: "/tmp/token",
        baseUrl: "http://0.0.0.0:4190",
      },
      userProfileRepository: createUserProfileRepositoryStub(),
      jobsRepository: createJobsRepositoryStub(),
      taskAuditRepository: createTaskAuditRepositoryStub(),
    })

    // Act
    const response = await app.inject({
      method: "PUT",
      url: "/external/settings/notification-profile",
      headers: {
        authorization: "Bearer secret",
      },
      payload: {
        timezone: "Europe/NopeTown",
      },
    })

    // Assert
    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({
      error: "invalid_request",
    })

    await app.close()
  })

  it("returns model catalog snapshot when authorized", async () => {
    // Arrange
    const app = buildExternalApiServer({
      logger: pino({ enabled: false }),
      config: {
        host: "0.0.0.0",
        port: 4190,
        token: "secret",
        tokenPath: "/tmp/token",
        baseUrl: "http://0.0.0.0:4190",
      },
      jobsRepository: createJobsRepositoryStub(),
      taskAuditRepository: createTaskAuditRepositoryStub(),
      modelManagement: createModelManagementStub({
        getCatalogSnapshot: () => ({
          refs: ["anthropic/claude-sonnet-4", "openai/gpt-5.3-codex"],
          updatedAt: 4_000,
          source: "network",
        }),
      }),
    })

    // Act
    const response = await app.inject({
      method: "GET",
      url: "/external/models/catalog",
      headers: {
        authorization: "Bearer secret",
      },
    })

    // Assert
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      models: ["anthropic/claude-sonnet-4", "openai/gpt-5.3-codex"],
      updatedAt: 4_000,
      source: "network",
    })

    await app.close()
  })

  it("refreshes model catalog and records command audit", async () => {
    // Arrange
    const auditRecords: CommandAuditRecord[] = []
    const app = buildExternalApiServer({
      logger: pino({ enabled: false }),
      config: {
        host: "0.0.0.0",
        port: 4190,
        token: "secret",
        tokenPath: "/tmp/token",
        baseUrl: "http://0.0.0.0:4190",
      },
      jobsRepository: createJobsRepositoryStub(),
      taskAuditRepository: createTaskAuditRepositoryStub(),
      commandAuditRepository: createCommandAuditRepositoryStub({
        insert: (record: CommandAuditRecord): void => {
          auditRecords.push(record)
        },
      }),
      modelManagement: createModelManagementStub({
        refreshCatalog: async () => ({
          refs: ["openai/gpt-5.3-codex", "openai/o3"],
          updatedAt: 9_000,
          source: "network",
        }),
      }),
    })

    // Act
    const response = await app.inject({
      method: "POST",
      url: "/external/models/refresh",
      headers: {
        authorization: "Bearer secret",
      },
    })

    // Assert
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      status: "ok",
      updatedAt: 9_000,
      count: 2,
    })
    expect(auditRecords[0]).toMatchObject({
      command: "external_models_refresh",
      status: "success",
    })

    await app.close()
  })

  it("returns and updates model defaults via external API", async () => {
    // Arrange
    const auditRecords: CommandAuditRecord[] = []
    let currentDefaults = {
      interactiveAssistant: "openai/gpt-5.3-codex",
      scheduledTasks: null,
      heartbeat: null,
      watchdogFailures: null,
    }

    const app = buildExternalApiServer({
      logger: pino({ enabled: false }),
      config: {
        host: "0.0.0.0",
        port: 4190,
        token: "secret",
        tokenPath: "/tmp/token",
        baseUrl: "http://0.0.0.0:4190",
      },
      jobsRepository: createJobsRepositoryStub(),
      taskAuditRepository: createTaskAuditRepositoryStub(),
      commandAuditRepository: createCommandAuditRepositoryStub({
        insert: (record: CommandAuditRecord): void => {
          auditRecords.push(record)
        },
      }),
      modelManagement: createModelManagementStub({
        getFlowDefaults: async () => currentDefaults,
        updateFlowDefaults: async (flowDefaults) => {
          currentDefaults = flowDefaults
          return currentDefaults
        },
      }),
    })

    // Act
    const before = await app.inject({
      method: "GET",
      url: "/external/models/defaults",
      headers: {
        authorization: "Bearer secret",
      },
    })
    const update = await app.inject({
      method: "PUT",
      url: "/external/models/defaults",
      headers: {
        authorization: "Bearer secret",
      },
      payload: {
        flowDefaults: {
          interactiveAssistant: "anthropic/claude-sonnet-4",
          scheduledTasks: "openai/gpt-5.3-codex",
          heartbeat: null,
          watchdogFailures: null,
        },
      },
    })

    // Assert
    expect(before.statusCode).toBe(200)
    expect(before.json()).toEqual({
      flowDefaults: {
        interactiveAssistant: "openai/gpt-5.3-codex",
        scheduledTasks: null,
        heartbeat: null,
        watchdogFailures: null,
      },
    })

    expect(update.statusCode).toBe(200)
    expect(update.json()).toEqual({
      flowDefaults: {
        interactiveAssistant: "anthropic/claude-sonnet-4",
        scheduledTasks: "openai/gpt-5.3-codex",
        heartbeat: null,
        watchdogFailures: null,
      },
    })
    expect(auditRecords.at(-1)).toMatchObject({
      command: "external_models_defaults_update",
      status: "success",
    })

    await app.close()
  })

  it("returns validation errors for invalid model defaults payload", async () => {
    // Arrange
    const app = buildExternalApiServer({
      logger: pino({ enabled: false }),
      config: {
        host: "0.0.0.0",
        port: 4190,
        token: "secret",
        tokenPath: "/tmp/token",
        baseUrl: "http://0.0.0.0:4190",
      },
      jobsRepository: createJobsRepositoryStub(),
      taskAuditRepository: createTaskAuditRepositoryStub(),
      modelManagement: createModelManagementStub(),
    })

    // Act
    const response = await app.inject({
      method: "PUT",
      url: "/external/models/defaults",
      headers: {
        authorization: "Bearer secret",
      },
      payload: {
        flowDefaults: {
          interactiveAssistant: "invalid",
          scheduledTasks: null,
          heartbeat: null,
          watchdogFailures: null,
        },
      },
    })

    // Assert
    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({
      error: "invalid_request",
    })

    await app.close()
  })

  it("returns jobs list when authorized", async () => {
    // Arrange
    const tasks = [createTaskListRecord("job-1")]
    const app = buildExternalApiServer({
      logger: pino({ enabled: false }),
      config: {
        host: "0.0.0.0",
        port: 4190,
        token: "secret",
        tokenPath: "/tmp/token",
        baseUrl: "http://0.0.0.0:4190",
      },
      jobsRepository: createJobsRepositoryStub({
        listTasks: (): TaskListRecord[] => tasks,
      }),
      taskAuditRepository: createTaskAuditRepositoryStub(),
    })

    // Act
    const response = await app.inject({
      method: "GET",
      url: "/external/jobs",
      headers: {
        authorization: "Bearer secret",
      },
    })

    // Assert
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      jobs: [{ id: "job-1", managedBy: "system", isMutable: false }],
    })

    await app.close()
  })

  it("returns not found for unknown job details", async () => {
    // Arrange
    const app = buildExternalApiServer({
      logger: pino({ enabled: false }),
      config: {
        host: "0.0.0.0",
        port: 4190,
        token: "secret",
        tokenPath: "/tmp/token",
        baseUrl: "http://0.0.0.0:4190",
      },
      jobsRepository: createJobsRepositoryStub(),
      taskAuditRepository: createTaskAuditRepositoryStub(),
    })

    // Act
    const response = await app.inject({
      method: "GET",
      url: "/external/jobs/missing",
      headers: {
        authorization: "Bearer secret",
      },
    })

    // Assert
    expect(response.statusCode).toBe(404)

    await app.close()
  })

  it("returns job details when authorized", async () => {
    // Arrange
    const job = createJobRecord("job-2")
    const app = buildExternalApiServer({
      logger: pino({ enabled: false }),
      config: {
        host: "0.0.0.0",
        port: 4190,
        token: "secret",
        tokenPath: "/tmp/token",
        baseUrl: "http://0.0.0.0:4190",
      },
      jobsRepository: createJobsRepositoryStub({
        getById: (jobId: string): JobRecord | null => {
          return jobId === job.id ? job : null
        },
      }),
      taskAuditRepository: createTaskAuditRepositoryStub(),
    })

    // Act
    const response = await app.inject({
      method: "GET",
      url: "/external/jobs/job-2",
      headers: {
        authorization: "Bearer secret",
      },
    })

    // Assert
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      job: {
        id: "job-2",
        type: "heartbeat",
        managedBy: "system",
        isMutable: false,
      },
    })

    await app.close()
  })

  it("returns job audit entries when authorized", async () => {
    // Arrange
    const job = createJobRecord("job-audit")
    const app = buildExternalApiServer({
      logger: pino({ enabled: false }),
      config: {
        host: "0.0.0.0",
        port: 4190,
        token: "secret",
        tokenPath: "/tmp/token",
        baseUrl: "http://0.0.0.0:4190",
      },
      jobsRepository: createJobsRepositoryStub({
        getById: (): JobRecord | null => job,
      }),
      taskAuditRepository: createTaskAuditRepositoryStub({
        listByTaskId: (): TaskAuditRecord[] => [createTaskAuditRecord("job-audit")],
      }),
    })

    // Act
    const response = await app.inject({
      method: "GET",
      url: "/external/jobs/job-audit/audit?limit=10",
      headers: {
        authorization: "Bearer secret",
      },
    })

    // Assert
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      taskId: "job-audit",
      entries: [
        {
          id: "audit-1",
          taskId: "job-audit",
          action: "update",
        },
      ],
    })

    await app.close()
  })

  it("returns paginated job runs when authorized", async () => {
    // Arrange
    const job = createJobRecord("job-runs")
    const app = buildExternalApiServer({
      logger: pino({ enabled: false }),
      config: {
        host: "0.0.0.0",
        port: 4190,
        token: "secret",
        tokenPath: "/tmp/token",
        baseUrl: "http://0.0.0.0:4190",
      },
      jobsRepository: createJobsRepositoryStub({
        getById: (): JobRecord | null => job,
        listRunsByJobId: (
          jobId: string,
          options?: {
            limit?: number
            offset?: number
          }
        ): JobRunRecord[] => {
          expect(jobId).toBe("job-runs")
          expect(options).toEqual({ limit: 5, offset: 10 })
          return [createJobRunRecord("job-runs", "run-11")]
        },
        countRunsByJobId: (): number => 37,
      }),
      taskAuditRepository: createTaskAuditRepositoryStub(),
    })

    // Act
    const response = await app.inject({
      method: "GET",
      url: "/external/jobs/job-runs/runs?limit=5&offset=10",
      headers: {
        authorization: "Bearer secret",
      },
    })

    // Assert
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      taskId: "job-runs",
      total: 37,
      limit: 5,
      offset: 10,
      runs: [{ id: "run-11", jobId: "job-runs" }],
    })

    await app.close()
  })

  it("returns a job run detail when authorized", async () => {
    // Arrange
    const job = createJobRecord("job-runs")
    const app = buildExternalApiServer({
      logger: pino({ enabled: false }),
      config: {
        host: "0.0.0.0",
        port: 4190,
        token: "secret",
        tokenPath: "/tmp/token",
        baseUrl: "http://0.0.0.0:4190",
      },
      jobsRepository: createJobsRepositoryStub({
        getById: (): JobRecord | null => job,
        getRunById: (jobId: string, runId: string): JobRunRecord | null => {
          expect(jobId).toBe("job-runs")
          return runId === "run-1" ? createJobRunRecord("job-runs", "run-1") : null
        },
      }),
      taskAuditRepository: createTaskAuditRepositoryStub(),
    })

    // Act
    const response = await app.inject({
      method: "GET",
      url: "/external/jobs/job-runs/runs/run-1",
      headers: {
        authorization: "Bearer secret",
      },
    })

    // Assert
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      taskId: "job-runs",
      run: {
        id: "run-1",
        jobId: "job-runs",
        status: "success",
      },
    })

    await app.close()
  })

  it("returns not found for unknown job run", async () => {
    // Arrange
    const job = createJobRecord("job-runs")
    const app = buildExternalApiServer({
      logger: pino({ enabled: false }),
      config: {
        host: "0.0.0.0",
        port: 4190,
        token: "secret",
        tokenPath: "/tmp/token",
        baseUrl: "http://0.0.0.0:4190",
      },
      jobsRepository: createJobsRepositoryStub({
        getById: (): JobRecord | null => job,
      }),
      taskAuditRepository: createTaskAuditRepositoryStub(),
    })

    // Act
    const response = await app.inject({
      method: "GET",
      url: "/external/jobs/job-runs/runs/missing-run",
      headers: {
        authorization: "Bearer secret",
      },
    })

    // Assert
    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({
      error: "not_found",
      message: "Run not found",
    })

    await app.close()
  })

  it("creates operator-managed jobs via external mutation endpoint", async () => {
    // Arrange
    const tasks = new Map<string, JobRecord>()
    const audit: TaskAuditRecord[] = []
    const app = buildExternalApiServer({
      logger: pino({ enabled: false }),
      config: {
        host: "0.0.0.0",
        port: 4190,
        token: "secret",
        tokenPath: "/tmp/token",
        baseUrl: "http://0.0.0.0:4190",
      },
      jobsRepository: createJobsRepositoryStub({
        getById: (jobId: string): JobRecord | null => {
          return tasks.get(jobId) ?? null
        },
        createTask: (record: JobRecord): void => {
          tasks.set(record.id, record)
        },
      }),
      taskAuditRepository: createTaskAuditRepositoryStub({
        insert: (record: TaskAuditRecord): void => {
          audit.push(record)
        },
      }),
    })

    // Act
    const response = await app.inject({
      method: "POST",
      url: "/external/jobs",
      headers: {
        authorization: "Bearer secret",
      },
      payload: {
        type: "operator-managed task",
        scheduleType: "oneshot",
        runAt: 4_000,
        modelRef: "openai/gpt-5.3-codex",
      },
    })

    // Assert
    expect(response.statusCode).toBe(201)
    const body = response.json() as {
      id: string
      status: string
    }
    expect(body.status).toBe("created")
    expect(tasks.get(body.id)?.type).toBe("operator-managed task")
    expect(tasks.get(body.id)?.modelRef).toBe("openai/gpt-5.3-codex")
    expect(audit[0]).toMatchObject({
      action: "create",
      lane: "scheduled",
      actor: "control_plane",
    })

    await app.close()
  })

  it("rejects mutation attempts for system-managed jobs", async () => {
    // Arrange
    const systemJob = createJobRecord("system-heartbeat")
    const app = buildExternalApiServer({
      logger: pino({ enabled: false }),
      config: {
        host: "0.0.0.0",
        port: 4190,
        token: "secret",
        tokenPath: "/tmp/token",
        baseUrl: "http://0.0.0.0:4190",
      },
      jobsRepository: createJobsRepositoryStub({
        getById: (): JobRecord | null => systemJob,
      }),
      taskAuditRepository: createTaskAuditRepositoryStub(),
    })

    // Act
    const response = await app.inject({
      method: "PATCH",
      url: "/external/jobs/system-heartbeat",
      headers: {
        authorization: "Bearer secret",
      },
      payload: {
        type: "attempted override",
      },
    })

    // Assert
    expect(response.statusCode).toBe(403)
    expect(response.json()).toMatchObject({
      error: "forbidden_mutation",
    })

    await app.close()
  })

  it("updates job modelRef through patch mutations", async () => {
    // Arrange
    const mutableJob = createJobRecord("job-model-update")
    mutableJob.type = "operator-task"
    const app = buildExternalApiServer({
      logger: pino({ enabled: false }),
      config: {
        host: "0.0.0.0",
        port: 4190,
        token: "secret",
        tokenPath: "/tmp/token",
        baseUrl: "http://0.0.0.0:4190",
      },
      jobsRepository: createJobsRepositoryStub({
        getById: (): JobRecord | null => mutableJob,
        updateTask: (
          _jobId: string,
          update: {
            type: string
            scheduleType: "recurring" | "oneshot"
            profileId: string | null
            modelRef: string | null
            runAt: number | null
            cadenceMinutes: number | null
            payload: string | null
            nextRunAt: number | null
          }
        ): void => {
          mutableJob.type = update.type
          mutableJob.scheduleType = update.scheduleType
          mutableJob.profileId = update.profileId
          mutableJob.modelRef = update.modelRef
          mutableJob.runAt = update.runAt
          mutableJob.cadenceMinutes = update.cadenceMinutes
          mutableJob.payload = update.payload
          mutableJob.nextRunAt = update.nextRunAt
        },
      }),
      taskAuditRepository: createTaskAuditRepositoryStub(),
    })

    // Act
    const explicit = await app.inject({
      method: "PATCH",
      url: "/external/jobs/job-model-update",
      headers: {
        authorization: "Bearer secret",
      },
      payload: {
        modelRef: "anthropic/claude-sonnet-4",
      },
    })

    const inherit = await app.inject({
      method: "PATCH",
      url: "/external/jobs/job-model-update",
      headers: {
        authorization: "Bearer secret",
      },
      payload: {
        modelRef: null,
      },
    })

    // Assert
    expect(explicit.statusCode).toBe(200)
    expect(inherit.statusCode).toBe(200)
    expect(mutableJob.modelRef).toBeNull()

    await app.close()
  })

  it("schedules mutable job for immediate run", async () => {
    // Arrange
    const mutableJob: JobRecord = {
      ...createJobRecord("job-operator-1"),
      type: "operator-task",
    }
    const app = buildExternalApiServer({
      logger: pino({ enabled: false }),
      config: {
        host: "0.0.0.0",
        port: 4190,
        token: "secret",
        tokenPath: "/tmp/token",
        baseUrl: "http://0.0.0.0:4190",
      },
      jobsRepository: createJobsRepositoryStub({
        getById: (): JobRecord | null => mutableJob,
        runTaskNow: (_jobId: string, scheduledFor: number): void => {
          mutableJob.nextRunAt = scheduledFor
          mutableJob.status = "idle"
          mutableJob.terminalState = null
          mutableJob.terminalReason = null
        },
      }),
      taskAuditRepository: createTaskAuditRepositoryStub(),
    })

    // Act
    const response = await app.inject({
      method: "POST",
      url: "/external/jobs/job-operator-1/run-now",
      headers: {
        authorization: "Bearer secret",
      },
    })

    // Assert
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      id: "job-operator-1",
      status: "run_now_scheduled",
    })
    expect(typeof mutableJob.nextRunAt).toBe("number")

    await app.close()
  })

  it("returns conflict when run-now is requested for running job", async () => {
    // Arrange
    const runningJob: JobRecord = {
      ...createJobRecord("job-operator-running"),
      type: "operator-task",
      status: "running",
    }
    const app = buildExternalApiServer({
      logger: pino({ enabled: false }),
      config: {
        host: "0.0.0.0",
        port: 4190,
        token: "secret",
        tokenPath: "/tmp/token",
        baseUrl: "http://0.0.0.0:4190",
      },
      jobsRepository: createJobsRepositoryStub({
        getById: (): JobRecord | null => runningJob,
      }),
      taskAuditRepository: createTaskAuditRepositoryStub(),
    })

    // Act
    const response = await app.inject({
      method: "POST",
      url: "/external/jobs/job-operator-running/run-now",
      headers: {
        authorization: "Bearer secret",
      },
    })

    // Assert
    expect(response.statusCode).toBe(409)
    expect(response.json()).toMatchObject({
      error: "state_conflict",
    })

    await app.close()
  })
})
