import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
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
        modelRef: string | null
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
    runTaskNow: (jobId: string, scheduledFor: number): void => {
      const existing = tasks.get(jobId)
      if (!existing) {
        return
      }

      tasks.set(jobId, {
        ...existing,
        status: "idle",
        nextRunAt: scheduledFor,
        terminalState: null,
        terminalReason: null,
      })
    },
    listTasks: (): TaskListRecord[] => {
      return Array.from(tasks.values()).map((task) => ({
        id: task.id,
        type: task.type,
        scheduleType: task.scheduleType,
        profileId: task.profileId,
        modelRef: task.modelRef,
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

const createUserProfileRepositoryStub = () => {
  let profile: {
    timezone: string | null
    quietHoursStart: string | null
    quietHoursEnd: string | null
    quietMode: "critical_only" | "off" | null
    muteUntil: number | null
    heartbeatMorning: string | null
    heartbeatMidday: string | null
    heartbeatEvening: string | null
    heartbeatCadenceMinutes: number | null
    heartbeatOnlyIfSignal: boolean
    onboardingCompletedAt: number | null
    lastDigestAt: number | null
    updatedAt: number
  } | null = null

  return {
    get: vi.fn(() => profile),
    upsert: vi.fn((next) => {
      profile = next
    }),
    setMuteUntil: vi.fn((muteUntil) => {
      if (!profile) {
        profile = {
          timezone: null,
          quietHoursStart: null,
          quietHoursEnd: null,
          quietMode: "critical_only",
          muteUntil,
          heartbeatMorning: null,
          heartbeatMidday: null,
          heartbeatEvening: null,
          heartbeatCadenceMinutes: 180,
          heartbeatOnlyIfSignal: true,
          onboardingCompletedAt: null,
          lastDigestAt: null,
          updatedAt: Date.now(),
        }
        return
      }

      profile = {
        ...profile,
        muteUntil,
        updatedAt: Date.now(),
      }
    }),
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
      userProfileRepository: createUserProfileRepositoryStub(),
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
      userProfileRepository: createUserProfileRepositoryStub(),
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
      userProfileRepository: createUserProfileRepositoryStub(),
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
      userProfileRepository: createUserProfileRepositoryStub(),
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

  it("queues outbound Telegram file when authorized", async () => {
    // Arrange
    const homeDirectory = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(homeDirectory)
    const sourceFilePath = path.join(homeDirectory, "inbox", "report.txt")
    await mkdir(path.dirname(sourceFilePath), { recursive: true })
    await writeFile(sourceFilePath, "hello", "utf8")

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
      ottoHome: homeDirectory,
      outboundMessagesRepository: repository,
      sessionBindingsRepository: {
        getTelegramChatIdBySessionId: vi.fn(() => 777),
      },
      jobsRepository: createJobsRepositoryStub(),
      taskAuditRepository: createTaskAuditRepositoryStub(),
      commandAuditRepository: createCommandAuditRepositoryStub(),
      userProfileRepository: createUserProfileRepositoryStub(),
    })

    // Act
    const response = await app.inject({
      method: "POST",
      url: "/internal/tools/queue-telegram-file",
      headers: {
        authorization: "Bearer secret",
      },
      payload: {
        sessionId: "session-1",
        kind: "document",
        filePath: "inbox/report.txt",
        mimeType: "text/plain",
        caption: "latest report",
      },
    })

    // Assert
    expect(response.statusCode).toBe(200)
    const firstCall = vi.mocked(repository.enqueueOrIgnoreDedupe).mock.calls[0]?.[0]
    expect(firstCall?.kind).toBe("document")
    expect(firstCall?.chatId).toBe(777)
    expect(firstCall?.mediaPath).toContain(path.join("data", "telegram-outbox"))

    await app.close()
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
      userProfileRepository: createUserProfileRepositoryStub(),
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

  it("denies system-managed task mutations in interactive lane", async () => {
    // Arrange
    const jobsRepository = createJobsRepositoryStub()
    jobsRepository.createTask({
      id: "system-heartbeat",
      type: "heartbeat",
      status: "idle",
      scheduleType: "recurring",
      profileId: null,
      modelRef: null,
      runAt: 1_000,
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
    })

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
      jobsRepository,
      taskAuditRepository: createTaskAuditRepositoryStub(),
      commandAuditRepository: createCommandAuditRepositoryStub(),
      userProfileRepository: createUserProfileRepositoryStub(),
    })

    // Act
    const response = await app.inject({
      method: "POST",
      url: "/internal/tools/tasks/update",
      headers: {
        authorization: "Bearer secret",
      },
      payload: {
        lane: "interactive",
        id: "system-heartbeat",
        type: "attempted-system-mutation",
      },
    })

    // Assert
    expect(response.statusCode).toBe(403)
    expect(response.json()).toMatchObject({
      error: "forbidden_mutation",
    })

    await app.close()
  })

  it("spawns interactive background one-shot jobs from the tool endpoint", async () => {
    // Arrange
    const jobsRepository = createJobsRepositoryStub()
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
        getTelegramChatIdBySessionId: vi.fn(() => 777),
      },
      jobsRepository,
      taskAuditRepository: createTaskAuditRepositoryStub(),
      commandAuditRepository: createCommandAuditRepositoryStub(),
      userProfileRepository: createUserProfileRepositoryStub(),
    })

    // Act
    const response = await app.inject({
      method: "POST",
      url: "/internal/tools/background-jobs/spawn",
      headers: {
        authorization: "Bearer secret",
      },
      payload: {
        lane: "interactive",
        sessionId: "session-42",
        request: "Analyze this repository and draft a migration plan",
        rationale: "Long-running analysis task",
        sourceMessageId: "12345",
      },
    })

    // Assert
    expect(response.statusCode).toBe(200)
    const body = response.json() as {
      status: string
      jobId: string
      jobType: string
      acknowledgement: string
    }
    expect(body.status).toBe("queued")
    expect(body.jobType).toBe("interactive_background_oneshot")
    expect(body.acknowledgement).toContain(body.jobId)

    const created = jobsRepository.getById(body.jobId)
    expect(created).not.toBeNull()
    expect(created?.type).toBe("interactive_background_oneshot")
    expect(created?.scheduleType).toBe("oneshot")
    expect(created?.nextRunAt).not.toBeNull()

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
      userProfileRepository: createUserProfileRepositoryStub(),
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
      userProfileRepository: createUserProfileRepositoryStub(),
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

  it("sets and returns notification policy profile", async () => {
    // Arrange
    const userProfileRepository = createUserProfileRepositoryStub()
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
      userProfileRepository,
    })

    // Act
    const setResponse = await app.inject({
      method: "POST",
      url: "/internal/tools/notification-profile/set",
      headers: {
        authorization: "Bearer secret",
      },
      payload: {
        lane: "interactive",
        timezone: "Europe/Vienna",
        quietHoursStart: "21:00",
        quietHoursEnd: "07:30",
        muteForMinutes: 30,
      },
    })

    const getResponse = await app.inject({
      method: "POST",
      url: "/internal/tools/notification-profile/get",
      headers: {
        authorization: "Bearer secret",
      },
      payload: {
        lane: "interactive",
      },
    })

    // Assert
    expect(setResponse.statusCode).toBe(200)
    expect(getResponse.statusCode).toBe(200)
    expect(getResponse.json()).toMatchObject({
      profile: {
        timezone: "Europe/Vienna",
        quietHoursStart: "21:00",
        quietHoursEnd: "07:30",
      },
    })

    await app.close()
  })

  it("rejects invalid timezone values in notification policy updates", async () => {
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
      userProfileRepository: createUserProfileRepositoryStub(),
    })

    // Act
    const response = await app.inject({
      method: "POST",
      url: "/internal/tools/notification-profile/set",
      headers: {
        authorization: "Bearer secret",
      },
      payload: {
        lane: "interactive",
        timezone: "Europe/NopeTown",
      },
    })

    // Assert
    expect(response.statusCode).toBe(400)

    await app.close()
  })
})
