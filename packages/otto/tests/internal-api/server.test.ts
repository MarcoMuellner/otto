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
  JobRunSessionRecord,
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

const createJobRunSessionsRepositoryStub = () => {
  const byRunId = new Map<string, JobRunSessionRecord>()

  return {
    insert: (record: {
      runId: string
      jobId: string
      sessionId: string
      createdAt: number
    }): void => {
      byRunId.set(record.runId, {
        runId: record.runId,
        jobId: record.jobId,
        sessionId: record.sessionId,
        createdAt: record.createdAt,
        closedAt: null,
        closeErrorMessage: null,
      })
    },
    markClosed: (runId: string, closedAt: number, closeErrorMessage: string | null): void => {
      const existing = byRunId.get(runId)
      if (!existing) {
        return
      }

      byRunId.set(runId, {
        ...existing,
        closedAt,
        closeErrorMessage,
      })
    },
    markCloseError: (runId: string, closeErrorMessage: string): void => {
      const existing = byRunId.get(runId)
      if (!existing || existing.closedAt != null) {
        return
      }

      byRunId.set(runId, {
        ...existing,
        closeErrorMessage,
      })
    },
    getByRunId: (runId: string): JobRunSessionRecord | null => {
      const record = byRunId.get(runId)
      return record ?? null
    },
    listActiveByJobId: (jobId: string): JobRunSessionRecord[] => {
      return [...byRunId.values()]
        .filter((record) => record.jobId === jobId && record.closedAt == null)
        .map((record) => ({ ...record }))
    },
    getLatestActiveBySessionId: (sessionId: string): JobRunSessionRecord | null => {
      const record = [...byRunId.values()]
        .filter((entry) => entry.sessionId === sessionId && entry.closedAt == null)
        .at(-1)

      return record ?? null
    },
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
      jobRunSessionsRepository: createJobRunSessionsRepositoryStub(),
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
      jobRunSessionsRepository: createJobRunSessionsRepositoryStub(),
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
      jobRunSessionsRepository: createJobRunSessionsRepositoryStub(),
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
      jobRunSessionsRepository: createJobRunSessionsRepositoryStub(),
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
      jobRunSessionsRepository: createJobRunSessionsRepositoryStub(),
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
      jobRunSessionsRepository: createJobRunSessionsRepositoryStub(),
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
      jobRunSessionsRepository: createJobRunSessionsRepositoryStub(),
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
      jobRunSessionsRepository: createJobRunSessionsRepositoryStub(),
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

  it("lists, shows, and cancels background tasks via dedicated endpoints", async () => {
    // Arrange
    const jobsRepository = createJobsRepositoryStub()
    jobsRepository.createTask({
      id: "job-background-ctrl-1",
      type: "interactive_background_oneshot",
      status: "running",
      scheduleType: "oneshot",
      profileId: null,
      modelRef: null,
      runAt: 5_000,
      cadenceMinutes: null,
      payload: JSON.stringify({
        version: 1,
        source: {
          surface: "interactive",
          sessionId: "session-origin-ctrl-1",
          sourceMessageId: "msg-ctrl-1",
          chatId: 777,
        },
        request: {
          text: "Investigate build performance regressions",
          requestedAt: 4_900,
          rationale: "long-running investigation",
        },
      }),
      lastRunAt: null,
      nextRunAt: 5_000,
      terminalState: null,
      terminalReason: null,
      lockToken: "lock-ctrl-1",
      lockExpiresAt: 6_000,
      createdAt: 4_900,
      updatedAt: 4_900,
    })

    const commandAuditRepository = createCommandAuditRepositoryStub()
    const jobRunSessionsRepository = createJobRunSessionsRepositoryStub()
    jobRunSessionsRepository.insert({
      runId: "run-ctrl-1",
      jobId: "job-background-ctrl-1",
      sessionId: "session-background-ctrl-1",
      createdAt: 5_000,
    })

    const closeSession = vi.fn(async () => {})

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
      jobRunSessionsRepository,
      sessionController: {
        closeSession,
      },
      jobsRepository,
      taskAuditRepository: createTaskAuditRepositoryStub(),
      commandAuditRepository,
      userProfileRepository: createUserProfileRepositoryStub(),
    })

    // Act
    const listed = await app.inject({
      method: "POST",
      url: "/internal/tools/background-jobs/list",
      headers: {
        authorization: "Bearer secret",
      },
      payload: {
        lane: "interactive",
      },
    })

    const shown = await app.inject({
      method: "POST",
      url: "/internal/tools/background-jobs/show",
      headers: {
        authorization: "Bearer secret",
      },
      payload: {
        lane: "interactive",
        jobId: "job-background-ctrl-1",
      },
    })

    const cancelled = await app.inject({
      method: "POST",
      url: "/internal/tools/background-jobs/cancel",
      headers: {
        authorization: "Bearer secret",
      },
      payload: {
        lane: "interactive",
        jobId: "job-background-ctrl-1",
        reason: "operator requested stop",
      },
    })

    // Assert
    expect(listed.statusCode).toBe(200)
    expect(listed.json()).toMatchObject({
      total: 1,
      tasks: [{ jobId: "job-background-ctrl-1" }],
    })

    expect(shown.statusCode).toBe(200)
    expect(shown.json()).toMatchObject({
      job: { id: "job-background-ctrl-1", type: "interactive_background_oneshot" },
      activeRunSessions: [{ sessionId: "session-background-ctrl-1" }],
    })

    expect(cancelled.statusCode).toBe(200)
    expect(cancelled.json()).toMatchObject({
      jobId: "job-background-ctrl-1",
      outcome: "cancelled",
      terminalState: "cancelled",
    })
    expect(closeSession).toHaveBeenCalledWith("session-background-ctrl-1")
    expect(jobsRepository.getById("job-background-ctrl-1")?.terminalState).toBe("cancelled")

    const commands = commandAuditRepository.listRecent() as Array<{ command: string }>
    expect(commands.map((entry) => entry.command)).toEqual(
      expect.arrayContaining([
        "list_background_tasks",
        "show_background_task",
        "cancel_background_task",
      ])
    )

    await app.close()
  })

  it("keeps completed background tasks unchanged when cancel is requested", async () => {
    // Arrange
    const jobsRepository = createJobsRepositoryStub()
    jobsRepository.createTask({
      id: "job-background-completed-1",
      type: "interactive_background_oneshot",
      status: "idle",
      scheduleType: "oneshot",
      profileId: null,
      modelRef: null,
      runAt: 5_000,
      cadenceMinutes: null,
      payload: JSON.stringify({
        version: 1,
        source: {
          surface: "interactive",
          sessionId: null,
          sourceMessageId: null,
          chatId: null,
        },
        request: {
          text: "Generate architecture proposal",
          requestedAt: 4_900,
          rationale: null,
        },
      }),
      lastRunAt: 5_500,
      nextRunAt: null,
      terminalState: "completed",
      terminalReason: null,
      lockToken: null,
      lockExpiresAt: null,
      createdAt: 4_900,
      updatedAt: 5_500,
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
      jobRunSessionsRepository: createJobRunSessionsRepositoryStub(),
      jobsRepository,
      taskAuditRepository: createTaskAuditRepositoryStub(),
      commandAuditRepository: createCommandAuditRepositoryStub(),
      userProfileRepository: createUserProfileRepositoryStub(),
    })

    // Act
    const response = await app.inject({
      method: "POST",
      url: "/internal/tools/background-jobs/cancel",
      headers: {
        authorization: "Bearer secret",
      },
      payload: {
        lane: "interactive",
        jobId: "job-background-completed-1",
      },
    })

    // Assert
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      jobId: "job-background-completed-1",
      outcome: "already_terminal",
      terminalState: "completed",
    })
    expect(jobsRepository.getById("job-background-completed-1")?.terminalState).toBe("completed")

    await app.close()
  })

  it("reports background milestones via active session context and throttles duplicates", async () => {
    // Arrange
    const previousInterval = process.env.OTTO_BACKGROUND_MILESTONE_MIN_INTERVAL_SECONDS
    process.env.OTTO_BACKGROUND_MILESTONE_MIN_INTERVAL_SECONDS = "300"

    const jobsRepository = createJobsRepositoryStub()
    jobsRepository.createTask({
      id: "job-background-1",
      type: "interactive_background_oneshot",
      status: "running",
      scheduleType: "oneshot",
      profileId: null,
      modelRef: null,
      runAt: 1_000,
      cadenceMinutes: null,
      payload: JSON.stringify({
        version: 1,
        source: {
          surface: "interactive",
          sessionId: "session-origin",
          sourceMessageId: "msg-1",
          chatId: null,
        },
        request: {
          text: "analyze logs",
          requestedAt: 1_000,
          rationale: null,
        },
      }),
      lastRunAt: null,
      nextRunAt: 1_000,
      terminalState: null,
      terminalReason: null,
      lockToken: "lock-1",
      lockExpiresAt: 9_999,
      createdAt: 900,
      updatedAt: 900,
    })

    const jobRunSessionsRepository = createJobRunSessionsRepositoryStub()
    jobRunSessionsRepository.insert({
      runId: "run-background-1",
      jobId: "job-background-1",
      sessionId: "session-active",
      createdAt: 1_000,
    })

    const dedupeKeys = new Set<string>()
    const repository: OutboundMessageEnqueueRepository = {
      enqueueOrIgnoreDedupe: vi.fn<OutboundMessageEnqueueRepository["enqueueOrIgnoreDedupe"]>(
        (record) => {
          if (record.dedupeKey && dedupeKeys.has(record.dedupeKey)) {
            return "duplicate"
          }
          if (record.dedupeKey) {
            dedupeKeys.add(record.dedupeKey)
          }
          return "enqueued"
        }
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
      jobRunSessionsRepository,
      jobsRepository,
      taskAuditRepository: createTaskAuditRepositoryStub(),
      commandAuditRepository: createCommandAuditRepositoryStub(),
      userProfileRepository: createUserProfileRepositoryStub(),
    })

    try {
      // Act
      const first = await app.inject({
        method: "POST",
        url: "/internal/tools/background-jobs/milestone",
        headers: {
          authorization: "Bearer secret",
        },
        payload: {
          lane: "interactive",
          sessionId: "session-active",
          content: "Phase 1 done",
        },
      })

      const second = await app.inject({
        method: "POST",
        url: "/internal/tools/background-jobs/milestone",
        headers: {
          authorization: "Bearer secret",
        },
        payload: {
          lane: "interactive",
          sessionId: "session-active",
          content: "Phase 2 done",
        },
      })

      // Assert
      expect(first.statusCode).toBe(200)
      expect(first.json()).toMatchObject({
        status: "enqueued",
        taskId: "job-background-1",
        runId: "run-background-1",
      })
      expect(second.statusCode).toBe(200)
      expect(second.json()).toMatchObject({
        status: "duplicate",
        taskId: "job-background-1",
        runId: "run-background-1",
      })
    } finally {
      await app.close()
      if (previousInterval === undefined) {
        delete process.env.OTTO_BACKGROUND_MILESTONE_MIN_INTERVAL_SECONDS
      } else {
        process.env.OTTO_BACKGROUND_MILESTONE_MIN_INTERVAL_SECONDS = previousInterval
      }
    }
  })

  it("reports background milestone using explicit task fallback", async () => {
    // Arrange
    const jobsRepository = createJobsRepositoryStub()
    jobsRepository.createTask({
      id: "job-background-2",
      type: "interactive_background_oneshot",
      status: "running",
      scheduleType: "oneshot",
      profileId: null,
      modelRef: null,
      runAt: 2_000,
      cadenceMinutes: null,
      payload: JSON.stringify({
        version: 1,
        source: {
          surface: "interactive",
          sessionId: null,
          sourceMessageId: null,
          chatId: 999,
        },
        request: {
          text: "prepare report",
          requestedAt: 2_000,
          rationale: null,
        },
      }),
      lastRunAt: null,
      nextRunAt: 2_000,
      terminalState: null,
      terminalReason: null,
      lockToken: "lock-2",
      lockExpiresAt: 9_999,
      createdAt: 1_900,
      updatedAt: 1_900,
    })

    const jobRunSessionsRepository = createJobRunSessionsRepositoryStub()
    jobRunSessionsRepository.insert({
      runId: "run-background-2",
      jobId: "job-background-2",
      sessionId: "session-bg-2",
      createdAt: 2_000,
    })

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
      jobRunSessionsRepository,
      jobsRepository,
      taskAuditRepository: createTaskAuditRepositoryStub(),
      commandAuditRepository: createCommandAuditRepositoryStub(),
      userProfileRepository: createUserProfileRepositoryStub(),
    })

    // Act
    const response = await app.inject({
      method: "POST",
      url: "/internal/tools/background-jobs/milestone",
      headers: {
        authorization: "Bearer secret",
      },
      payload: {
        lane: "interactive",
        taskId: "job-background-2",
        content: "Halfway there",
      },
    })

    // Assert
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      status: "enqueued",
      taskId: "job-background-2",
      runId: "run-background-2",
    })

    const firstCall = vi.mocked(repository.enqueueOrIgnoreDedupe).mock.calls[0]?.[0]
    expect(firstCall?.chatId).toBe(999)

    await app.close()
  })

  it("rejects milestone reports for closed run ids", async () => {
    // Arrange
    const jobsRepository = createJobsRepositoryStub()
    jobsRepository.createTask({
      id: "job-background-closed",
      type: "interactive_background_oneshot",
      status: "idle",
      scheduleType: "oneshot",
      profileId: null,
      modelRef: null,
      runAt: 3_000,
      cadenceMinutes: null,
      payload: JSON.stringify({
        version: 1,
        source: {
          surface: "interactive",
          sessionId: null,
          sourceMessageId: null,
          chatId: 888,
        },
        request: {
          text: "finish writeup",
          requestedAt: 3_000,
          rationale: null,
        },
      }),
      lastRunAt: null,
      nextRunAt: null,
      terminalState: "completed",
      terminalReason: null,
      lockToken: null,
      lockExpiresAt: null,
      createdAt: 2_900,
      updatedAt: 3_100,
    })

    const jobRunSessionsRepository = createJobRunSessionsRepositoryStub()
    jobRunSessionsRepository.insert({
      runId: "run-closed-1",
      jobId: "job-background-closed",
      sessionId: "session-closed-1",
      createdAt: 3_000,
    })
    jobRunSessionsRepository.markClosed("run-closed-1", 3_100)

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
      jobRunSessionsRepository,
      jobsRepository,
      taskAuditRepository: createTaskAuditRepositoryStub(),
      commandAuditRepository: createCommandAuditRepositoryStub(),
      userProfileRepository: createUserProfileRepositoryStub(),
    })

    // Act
    const response = await app.inject({
      method: "POST",
      url: "/internal/tools/background-jobs/milestone",
      headers: {
        authorization: "Bearer secret",
      },
      payload: {
        lane: "interactive",
        runId: "run-closed-1",
        content: "late milestone",
      },
    })

    // Assert
    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({
      error: "missing_task_context",
    })
    expect(repository.enqueueOrIgnoreDedupe).not.toHaveBeenCalled()

    await app.close()
  })

  it("falls back to session context when provided runId is closed", async () => {
    // Arrange
    const jobsRepository = createJobsRepositoryStub()
    jobsRepository.createTask({
      id: "job-background-fallback",
      type: "interactive_background_oneshot",
      status: "running",
      scheduleType: "oneshot",
      profileId: null,
      modelRef: null,
      runAt: 4_000,
      cadenceMinutes: null,
      payload: JSON.stringify({
        version: 1,
        source: {
          surface: "interactive",
          sessionId: "session-origin-fallback",
          sourceMessageId: "msg-fallback",
          chatId: 555,
        },
        request: {
          text: "continue analysis",
          requestedAt: 4_000,
          rationale: null,
        },
      }),
      lastRunAt: null,
      nextRunAt: 4_000,
      terminalState: null,
      terminalReason: null,
      lockToken: "lock-fallback",
      lockExpiresAt: 9_999,
      createdAt: 3_900,
      updatedAt: 3_900,
    })

    const jobRunSessionsRepository = createJobRunSessionsRepositoryStub()
    jobRunSessionsRepository.insert({
      runId: "run-fallback-closed",
      jobId: "job-background-closed",
      sessionId: "session-active-fallback",
      createdAt: 3_800,
    })
    jobRunSessionsRepository.markClosed("run-fallback-closed", 3_850, null)
    jobRunSessionsRepository.insert({
      runId: "run-fallback-active",
      jobId: "job-background-fallback",
      sessionId: "session-active-fallback",
      createdAt: 4_000,
    })

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
      jobRunSessionsRepository,
      jobsRepository,
      taskAuditRepository: createTaskAuditRepositoryStub(),
      commandAuditRepository: createCommandAuditRepositoryStub(),
      userProfileRepository: createUserProfileRepositoryStub(),
    })

    // Act
    const response = await app.inject({
      method: "POST",
      url: "/internal/tools/background-jobs/milestone",
      headers: {
        authorization: "Bearer secret",
      },
      payload: {
        lane: "interactive",
        runId: "run-fallback-closed",
        sessionId: "session-active-fallback",
        content: "fallback milestone",
      },
    })

    // Assert
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      status: "enqueued",
      taskId: "job-background-fallback",
      runId: "run-fallback-active",
    })

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
      jobRunSessionsRepository: createJobRunSessionsRepositoryStub(),
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
      jobRunSessionsRepository: createJobRunSessionsRepositoryStub(),
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
      jobRunSessionsRepository: createJobRunSessionsRepositoryStub(),
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
      jobRunSessionsRepository: createJobRunSessionsRepositoryStub(),
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
