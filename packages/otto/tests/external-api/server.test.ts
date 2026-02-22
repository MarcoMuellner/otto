import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import pino from "pino"
import { afterEach, describe, expect, it } from "vitest"

import { buildExternalApiServer, resolveExternalApiConfig } from "../../src/external-api/server.js"
import type {
  JobRecord,
  JobRunRecord,
  TaskAuditRecord,
  TaskListRecord,
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
      jobsRepository: {
        listTasks: (): TaskListRecord[] => [],
        getById: (): JobRecord | null => null,
        listRunsByJobId: (): JobRunRecord[] => [],
        countRunsByJobId: (): number => 0,
        getRunById: (): JobRunRecord | null => null,
      },
      taskAuditRepository: {
        listByTaskId: (): TaskAuditRecord[] => [],
      },
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
      jobsRepository: {
        listTasks: (): TaskListRecord[] => [],
        getById: (): JobRecord | null => null,
        listRunsByJobId: (): JobRunRecord[] => [],
        countRunsByJobId: (): number => 0,
        getRunById: (): JobRunRecord | null => null,
      },
      taskAuditRepository: {
        listByTaskId: (): TaskAuditRecord[] => [],
      },
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
      jobsRepository: {
        listTasks: (): TaskListRecord[] => tasks,
        getById: (): JobRecord | null => null,
        listRunsByJobId: (): JobRunRecord[] => [],
        countRunsByJobId: (): number => 0,
        getRunById: (): JobRunRecord | null => null,
      },
      taskAuditRepository: {
        listByTaskId: (): TaskAuditRecord[] => [],
      },
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
      jobsRepository: {
        listTasks: (): TaskListRecord[] => [],
        getById: (): JobRecord | null => null,
        listRunsByJobId: (): JobRunRecord[] => [],
        countRunsByJobId: (): number => 0,
        getRunById: (): JobRunRecord | null => null,
      },
      taskAuditRepository: {
        listByTaskId: (): TaskAuditRecord[] => [],
      },
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
      jobsRepository: {
        listTasks: (): TaskListRecord[] => [],
        getById: (jobId: string): JobRecord | null => {
          return jobId === job.id ? job : null
        },
        listRunsByJobId: (): JobRunRecord[] => [],
        countRunsByJobId: (): number => 0,
        getRunById: (): JobRunRecord | null => null,
      },
      taskAuditRepository: {
        listByTaskId: (): TaskAuditRecord[] => [],
      },
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
      jobsRepository: {
        listTasks: (): TaskListRecord[] => [],
        getById: (): JobRecord | null => job,
        listRunsByJobId: (): JobRunRecord[] => [],
        countRunsByJobId: (): number => 0,
        getRunById: (): JobRunRecord | null => null,
      },
      taskAuditRepository: {
        listByTaskId: (): TaskAuditRecord[] => [createTaskAuditRecord("job-audit")],
      },
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
      jobsRepository: {
        listTasks: (): TaskListRecord[] => [],
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
        getRunById: (): JobRunRecord | null => null,
      },
      taskAuditRepository: {
        listByTaskId: (): TaskAuditRecord[] => [],
      },
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
      jobsRepository: {
        listTasks: (): TaskListRecord[] => [],
        getById: (): JobRecord | null => job,
        listRunsByJobId: (): JobRunRecord[] => [],
        countRunsByJobId: (): number => 0,
        getRunById: (jobId: string, runId: string): JobRunRecord | null => {
          expect(jobId).toBe("job-runs")
          return runId === "run-1" ? createJobRunRecord("job-runs", "run-1") : null
        },
      },
      taskAuditRepository: {
        listByTaskId: (): TaskAuditRecord[] => [],
      },
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
      jobsRepository: {
        listTasks: (): TaskListRecord[] => [],
        getById: (): JobRecord | null => job,
        listRunsByJobId: (): JobRunRecord[] => [],
        countRunsByJobId: (): number => 0,
        getRunById: (): JobRunRecord | null => null,
      },
      taskAuditRepository: {
        listByTaskId: (): TaskAuditRecord[] => [],
      },
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
})
