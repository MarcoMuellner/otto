import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"
import type { Logger } from "pino"

import { buildInternalApiServer, resolveInternalApiConfig } from "../../src/internal-api/server.js"
import type { OutboundMessageEnqueueRepository } from "../../src/telegram-worker/outbound-enqueue.js"
import type {
  FailedJobRunRecord,
  JobRecord,
  TaskListRecord,
} from "../../src/persistence/repositories.js"

const TEMP_PREFIX = path.join(tmpdir(), "otto-internal-api-")
const cleanupPaths: string[] = []

afterEach(async () => {
  await Promise.all(
    cleanupPaths.splice(0).map(async (directory) => rm(directory, { recursive: true, force: true }))
  )
})

const createLoggerStub = (): Logger => {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as Logger
}

const createJobsRepositoryStub = () => {
  const tasks = new Map<string, JobRecord>()
  const failedRuns: FailedJobRunRecord[] = []

  return {
    getById: (jobId: string): JobRecord | null => {
      return tasks.get(jobId) ?? null
    },
    createTask: (record: JobRecord): void => {
      tasks.set(record.id, record)
    },
    updateTask: (
      jobId: string,
      update: {
        type: string
        scheduleType: "recurring" | "oneshot"
        profileId: string | null
        runAt: number | null
        cadenceMinutes: number | null
        payload: string | null
        nextRunAt: number | null
      }
    ): void => {
      const existing = tasks.get(jobId)
      if (!existing) {
        return
      }

      tasks.set(jobId, {
        ...existing,
        ...update,
      })
    },
    cancelTask: (jobId: string): void => {
      const existing = tasks.get(jobId)
      if (!existing) {
        return
      }

      tasks.set(jobId, {
        ...existing,
        terminalState: "cancelled",
        nextRunAt: null,
      })
    },
    listTasks: (): TaskListRecord[] => {
      return Array.from(tasks.values()).map((task) => ({
        id: task.id,
        type: task.type,
        scheduleType: task.scheduleType,
        profileId: task.profileId,
        status: task.status,
        runAt: task.runAt,
        cadenceMinutes: task.cadenceMinutes,
        nextRunAt: task.nextRunAt,
        terminalState: task.terminalState,
        terminalReason: task.terminalReason,
        updatedAt: task.updatedAt,
      }))
    },
    listRecentFailedRuns: (): FailedJobRunRecord[] => {
      return [...failedRuns]
    },
    setRecentFailedRuns: (rows: FailedJobRunRecord[]): void => {
      failedRuns.splice(0, failedRuns.length, ...rows)
    },
  }
}

const createTaskAuditRepositoryStub = () => {
  const rows: Array<{ id: string }> = []
  return {
    insert: vi.fn((record: { id: string }) => {
      rows.push(record)
    }),
    listRecent: vi.fn(() => rows as Array<never>),
  }
}

const createCommandAuditRepositoryStub = () => {
  const rows: Array<{ id: string }> = []
  return {
    insert: vi.fn((record: { id: string }) => {
      rows.push(record)
    }),
    listRecent: vi.fn(() => rows as Array<never>),
  }
}

describe("resolveInternalApiConfig", () => {
  it("creates and reuses a persisted token file", async () => {
    // Arrange
    const homeDirectory = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(homeDirectory)

    // Act
    const first = await resolveInternalApiConfig(homeDirectory, {})
    const second = await resolveInternalApiConfig(homeDirectory, {})

    // Assert
    expect(first.token).toBe(second.token)
    const persisted = await readFile(first.tokenPath, "utf8")
    expect(persisted.trim()).toBe(first.token)
  })
})

describe("buildInternalApiServer", () => {
  it("returns unauthorized when token is missing", async () => {
    // Arrange
    const repository: OutboundMessageEnqueueRepository = {
      enqueueOrIgnoreDedupe: vi.fn<OutboundMessageEnqueueRepository["enqueueOrIgnoreDedupe"]>(
        () => "enqueued"
      ),
    }
    const app = buildInternalApiServer({
      logger: createLoggerStub(),
      config: {
        host: "127.0.0.1",
        port: 4180,
        token: "secret",
        tokenPath: "/tmp/token",
        baseUrl: "http://127.0.0.1:4180",
      },
      outboundMessagesRepository: repository,
      sessionBindingsRepository: {
        getTelegramChatIdBySessionId: vi.fn(() => null),
      },
      jobsRepository: createJobsRepositoryStub(),
      taskAuditRepository: createTaskAuditRepositoryStub(),
      commandAuditRepository: createCommandAuditRepositoryStub(),
    })

    // Act
    const response = await app.inject({
      method: "POST",
      url: "/internal/tools/queue-telegram-message",
      payload: { chatId: 7, content: "hello" },
    })

    // Assert
    expect(response.statusCode).toBe(401)
    await app.close()
  })

  it("queues message when authorized", async () => {
    // Arrange
    const repository: OutboundMessageEnqueueRepository = {
      enqueueOrIgnoreDedupe: vi.fn<OutboundMessageEnqueueRepository["enqueueOrIgnoreDedupe"]>(
        () => "enqueued"
      ),
    }
    const app = buildInternalApiServer({
      logger: createLoggerStub(),
      config: {
        host: "127.0.0.1",
        port: 4180,
        token: "secret",
        tokenPath: "/tmp/token",
        baseUrl: "http://127.0.0.1:4180",
      },
      outboundMessagesRepository: repository,
      sessionBindingsRepository: {
        getTelegramChatIdBySessionId: vi.fn(() => null),
      },
      jobsRepository: createJobsRepositoryStub(),
      taskAuditRepository: createTaskAuditRepositoryStub(),
      commandAuditRepository: createCommandAuditRepositoryStub(),
    })

    // Act
    const response = await app.inject({
      method: "POST",
      url: "/internal/tools/queue-telegram-message",
      headers: {
        authorization: "Bearer secret",
      },
      payload: {
        chatId: 9,
        content: "hello",
        dedupeKey: "dedupe-1",
      },
    })

    // Assert
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      status: "enqueued",
      queuedCount: 1,
      duplicateCount: 0,
      dedupeKey: "dedupe-1",
    })
    expect(repository.enqueueOrIgnoreDedupe).toHaveBeenCalledOnce()

    await app.close()
  })

  it("resolves chat id from session binding when chatId is omitted", async () => {
    // Arrange
    const repository: OutboundMessageEnqueueRepository = {
      enqueueOrIgnoreDedupe: vi.fn<OutboundMessageEnqueueRepository["enqueueOrIgnoreDedupe"]>(
        () => "enqueued"
      ),
    }
    const app = buildInternalApiServer({
      logger: createLoggerStub(),
      config: {
        host: "127.0.0.1",
        port: 4180,
        token: "secret",
        tokenPath: "/tmp/token",
        baseUrl: "http://127.0.0.1:4180",
      },
      outboundMessagesRepository: repository,
      sessionBindingsRepository: {
        getTelegramChatIdBySessionId: vi.fn(() => 777),
      },
      jobsRepository: createJobsRepositoryStub(),
      taskAuditRepository: createTaskAuditRepositoryStub(),
      commandAuditRepository: createCommandAuditRepositoryStub(),
    })

    // Act
    const response = await app.inject({
      method: "POST",
      url: "/internal/tools/queue-telegram-message",
      headers: {
        authorization: "Bearer secret",
      },
      payload: {
        sessionId: "session-1",
        content: "hello from session",
        dedupeKey: "dedupe-2",
      },
    })

    // Assert
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      status: "enqueued",
      dedupeKey: "dedupe-2",
    })
    const firstCall = vi.mocked(repository.enqueueOrIgnoreDedupe).mock.calls[0]?.[0]
    expect(firstCall?.chatId).toBe(777)

    await app.close()
  })

  it("falls back to TELEGRAM_ALLOWED_USER_ID when chat and session binding are missing", async () => {
    // Arrange
    const previousAllowedUserId = process.env.TELEGRAM_ALLOWED_USER_ID
    process.env.TELEGRAM_ALLOWED_USER_ID = "8334178095"

    const repository: OutboundMessageEnqueueRepository = {
      enqueueOrIgnoreDedupe: vi.fn<OutboundMessageEnqueueRepository["enqueueOrIgnoreDedupe"]>(
        () => "enqueued"
      ),
    }
    const app = buildInternalApiServer({
      logger: createLoggerStub(),
      config: {
        host: "127.0.0.1",
        port: 4180,
        token: "secret",
        tokenPath: "/tmp/token",
        baseUrl: "http://127.0.0.1:4180",
      },
      outboundMessagesRepository: repository,
      sessionBindingsRepository: {
        getTelegramChatIdBySessionId: vi.fn(() => null),
      },
      jobsRepository: createJobsRepositoryStub(),
      taskAuditRepository: createTaskAuditRepositoryStub(),
      commandAuditRepository: createCommandAuditRepositoryStub(),
    })

    try {
      // Act
      const response = await app.inject({
        method: "POST",
        url: "/internal/tools/queue-telegram-message",
        headers: {
          authorization: "Bearer secret",
        },
        payload: {
          content: "hello from fallback",
          dedupeKey: "dedupe-fallback",
        },
      })

      // Assert
      expect(response.statusCode).toBe(200)
      const firstCall = vi.mocked(repository.enqueueOrIgnoreDedupe).mock.calls[0]?.[0]
      expect(firstCall?.chatId).toBe(8334178095)
    } finally {
      await app.close()

      if (previousAllowedUserId === undefined) {
        delete process.env.TELEGRAM_ALLOWED_USER_ID
      } else {
        process.env.TELEGRAM_ALLOWED_USER_ID = previousAllowedUserId
      }
    }
  })

  it("denies scheduled lane task mutations and allows list", async () => {
    // Arrange
    const app = buildInternalApiServer({
      logger: createLoggerStub(),
      config: {
        host: "127.0.0.1",
        port: 4180,
        token: "secret",
        tokenPath: "/tmp/token",
        baseUrl: "http://127.0.0.1:4180",
      },
      outboundMessagesRepository: {
        enqueueOrIgnoreDedupe: vi.fn<OutboundMessageEnqueueRepository["enqueueOrIgnoreDedupe"]>(
          () => "enqueued"
        ),
      },
      sessionBindingsRepository: {
        getTelegramChatIdBySessionId: vi.fn(() => null),
      },
      jobsRepository: createJobsRepositoryStub(),
      taskAuditRepository: createTaskAuditRepositoryStub(),
      commandAuditRepository: createCommandAuditRepositoryStub(),
    })

    // Act
    const deniedCreate = await app.inject({
      method: "POST",
      url: "/internal/tools/tasks/create",
      headers: {
        authorization: "Bearer secret",
      },
      payload: {
        lane: "scheduled",
        type: "test",
        scheduleType: "oneshot",
        runAt: 1_000,
      },
    })

    const allowedList = await app.inject({
      method: "POST",
      url: "/internal/tools/tasks/list",
      headers: {
        authorization: "Bearer secret",
      },
      payload: {
        lane: "scheduled",
      },
    })

    // Assert
    expect(deniedCreate.statusCode).toBe(403)
    expect(allowedList.statusCode).toBe(200)

    await app.close()
  })

  it("returns task and command audit streams", async () => {
    // Arrange
    const taskAuditRepository = createTaskAuditRepositoryStub()
    const commandAuditRepository = createCommandAuditRepositoryStub()
    taskAuditRepository.insert({ id: "task-audit-1" })
    commandAuditRepository.insert({ id: "cmd-audit-1" })

    const app = buildInternalApiServer({
      logger: createLoggerStub(),
      config: {
        host: "127.0.0.1",
        port: 4180,
        token: "secret",
        tokenPath: "/tmp/token",
        baseUrl: "http://127.0.0.1:4180",
      },
      outboundMessagesRepository: {
        enqueueOrIgnoreDedupe: vi.fn<OutboundMessageEnqueueRepository["enqueueOrIgnoreDedupe"]>(
          () => "enqueued"
        ),
      },
      sessionBindingsRepository: {
        getTelegramChatIdBySessionId: vi.fn(() => null),
      },
      jobsRepository: createJobsRepositoryStub(),
      taskAuditRepository,
      commandAuditRepository,
    })

    // Act
    const response = await app.inject({
      method: "POST",
      url: "/internal/tools/tasks/audit/list",
      headers: {
        authorization: "Bearer secret",
      },
      payload: {
        lane: "interactive",
      },
    })

    // Assert
    expect(response.statusCode).toBe(200)
    const body = response.json() as {
      taskAudit: Array<{ id: string }>
      commandAudit: Array<{ id: string }>
    }
    expect(body.taskAudit[0]?.id).toBe("task-audit-1")
    expect(body.commandAudit[0]?.id).toBe("cmd-audit-1")

    await app.close()
  })

  it("checks failed runs and enqueues dedupe-safe watchdog alert", async () => {
    // Arrange
    const jobsRepository = createJobsRepositoryStub()
    jobsRepository.setRecentFailedRuns([
      {
        runId: "run-1",
        jobId: "job-1",
        jobType: "email-triage",
        startedAt: 1_000,
        errorCode: "tool_timeout",
        errorMessage: "tool call timed out",
      },
      {
        runId: "run-2",
        jobId: "job-2",
        jobType: "general-reminder",
        startedAt: 900,
        errorCode: null,
        errorMessage: "upstream service unavailable",
      },
    ])

    const repository: OutboundMessageEnqueueRepository = {
      enqueueOrIgnoreDedupe: vi.fn<OutboundMessageEnqueueRepository["enqueueOrIgnoreDedupe"]>(
        () => "enqueued"
      ),
    }

    const app = buildInternalApiServer({
      logger: createLoggerStub(),
      config: {
        host: "127.0.0.1",
        port: 4180,
        token: "secret",
        tokenPath: "/tmp/token",
        baseUrl: "http://127.0.0.1:4180",
      },
      outboundMessagesRepository: repository,
      sessionBindingsRepository: {
        getTelegramChatIdBySessionId: vi.fn(() => 777),
      },
      jobsRepository,
      taskAuditRepository: createTaskAuditRepositoryStub(),
      commandAuditRepository: createCommandAuditRepositoryStub(),
    })

    // Act
    const response = await app.inject({
      method: "POST",
      url: "/internal/tools/tasks/failures/check",
      headers: {
        authorization: "Bearer secret",
      },
      payload: {
        lane: "interactive",
        sessionId: "session-1",
        lookbackMinutes: 120,
        threshold: 2,
        notify: true,
      },
    })

    // Assert
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      failedCount: 2,
      shouldAlert: true,
      notificationStatus: "enqueued",
    })
    expect(repository.enqueueOrIgnoreDedupe).toHaveBeenCalledOnce()

    await app.close()
  })
})
