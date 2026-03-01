import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"

import { INTERACTIVE_BACKGROUND_ONESHOT_JOB_TYPE } from "../../src/api-services/interactive-background-jobs.js"
import {
  createJobsRepository,
  createJobRunSessionsRepository,
  createOutboundMessagesRepository,
  createSessionBindingsRepository,
  openPersistenceDatabase,
} from "../../src/persistence/index.js"
import { createTaskExecutionEngine } from "../../src/scheduler/executor.js"

const TEMP_PREFIX = path.join(tmpdir(), "otto-scheduler-executor-")
const cleanupPaths: string[] = []

afterEach(async () => {
  await Promise.all(
    cleanupPaths.splice(0).map(async (directory) => rm(directory, { recursive: true, force: true }))
  )
})

const createLoggerStub = () => {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
}

const writeMinimalTaskConfig = async (ottoHome: string): Promise<void> => {
  const taskConfigDirectory = path.join(ottoHome, "task-config")
  await mkdir(path.join(taskConfigDirectory, "profiles"), { recursive: true })
  await writeFile(
    path.join(taskConfigDirectory, "base.jsonc"),
    JSON.stringify(
      {
        version: 1,
        base: {
          opencode: {
            agent: {
              assistant: {
                prompt: "Execute the scheduled task and return strict JSON.",
              },
            },
          },
        },
        lanes: {
          scheduled: {
            opencode: {
              agent: {
                assistant: {
                  tools: {
                    list_tasks: true,
                    check_task_failures: true,
                  },
                },
              },
            },
          },
        },
      },
      null,
      2
    ),
    "utf8"
  )

  await writeFile(
    path.join(taskConfigDirectory, "profiles", "general-reminder.jsonc"),
    JSON.stringify(
      {
        version: 1,
        id: "general-reminder",
        laneOverrides: {
          scheduled: {
            opencode: {},
          },
        },
      },
      null,
      2
    ),
    "utf8"
  )
}

const writeMinimalPromptWorkspace = async (
  ottoHome: string,
  input: {
    userMapping?: Record<string, unknown>
  } = {}
): Promise<void> => {
  const systemPromptsDirectory = path.join(ottoHome, "system-prompts")
  const userPromptsDirectory = path.join(ottoHome, "prompts")

  await mkdir(path.join(systemPromptsDirectory, "layers"), { recursive: true })
  await mkdir(path.join(systemPromptsDirectory, "task-profiles"), { recursive: true })
  await mkdir(path.join(userPromptsDirectory, "layers"), { recursive: true })
  await mkdir(path.join(userPromptsDirectory, "task-profiles"), { recursive: true })

  await writeFile(
    path.join(systemPromptsDirectory, "mapping.jsonc"),
    JSON.stringify(
      {
        version: 1,
        selectors: {
          interactive: {
            default: "interactive-cli",
            media: {
              chatapps: "interactive-chatapps",
              web: "interactive-web",
              cli: "interactive-cli",
            },
          },
          scheduled: {
            default: "scheduled-cli",
            media: {
              chatapps: "scheduled-chatapps",
              web: "scheduled-web",
              cli: "scheduled-cli",
            },
          },
          background: {
            default: "background-cli",
            media: {
              chatapps: "background-chatapps",
              web: "background-web",
              cli: "background-cli",
            },
          },
          watchdog: {
            default: "watchdog-default",
            media: {},
          },
        },
        routes: {
          "interactive-chatapps": {
            layers: {
              "core-persona": { source: "system", path: "layers/core.md" },
            },
          },
          "interactive-web": {
            layers: {
              "core-persona": { source: "system", path: "layers/core.md" },
            },
          },
          "interactive-cli": {
            layers: {
              "core-persona": { source: "system", path: "layers/core.md" },
            },
          },
          "scheduled-chatapps": {
            layers: {
              "core-persona": { source: "system", path: "layers/core.md" },
              surface: { source: "system", path: "layers/surface-scheduled.md" },
              media: { source: "system", path: "layers/media-chatapps.md" },
            },
          },
          "scheduled-web": {
            layers: {
              "core-persona": { source: "system", path: "layers/core.md" },
              surface: { source: "system", path: "layers/surface-scheduled.md" },
              media: { source: "system", path: "layers/media-web.md" },
            },
          },
          "scheduled-cli": {
            layers: {
              "core-persona": { source: "system", path: "layers/core.md" },
              surface: { source: "system", path: "layers/surface-scheduled.md" },
              media: { source: "system", path: "layers/media-cli.md" },
            },
          },
          "background-chatapps": {
            layers: {
              "core-persona": { source: "system", path: "layers/core.md" },
              surface: { source: "system", path: "layers/surface-background.md" },
              media: { source: "system", path: "layers/media-chatapps.md" },
            },
          },
          "background-web": {
            layers: {
              "core-persona": { source: "system", path: "layers/core.md" },
              surface: { source: "system", path: "layers/surface-background.md" },
              media: { source: "system", path: "layers/media-web.md" },
            },
          },
          "background-cli": {
            layers: {
              "core-persona": { source: "system", path: "layers/core.md" },
              surface: { source: "system", path: "layers/surface-background.md" },
              media: { source: "system", path: "layers/media-cli.md" },
            },
          },
          "watchdog-default": {
            layers: {
              "core-persona": { source: "system", path: "layers/watchdog.md" },
            },
          },
        },
      },
      null,
      2
    ),
    "utf8"
  )

  await writeFile(
    path.join(userPromptsDirectory, "mapping.jsonc"),
    JSON.stringify(input.userMapping ?? { version: 1, selectors: {}, routes: {} }, null, 2),
    "utf8"
  )

  await writeFile(
    path.join(systemPromptsDirectory, "layers", "core.md"),
    "# Core\nSystem core\n",
    "utf8"
  )
  await writeFile(
    path.join(systemPromptsDirectory, "layers", "surface-scheduled.md"),
    "## Surface\nScheduled surface\n",
    "utf8"
  )
  await writeFile(
    path.join(systemPromptsDirectory, "layers", "surface-background.md"),
    "## Surface\nBackground surface\n",
    "utf8"
  )
  await writeFile(
    path.join(systemPromptsDirectory, "layers", "media-cli.md"),
    "## Media\nCLI media\n",
    "utf8"
  )
  await writeFile(
    path.join(systemPromptsDirectory, "layers", "media-web.md"),
    "## Media\nWeb media\n",
    "utf8"
  )
  await writeFile(
    path.join(systemPromptsDirectory, "layers", "media-chatapps.md"),
    "## Media\nChatapps media\n",
    "utf8"
  )
  await writeFile(
    path.join(systemPromptsDirectory, "layers", "watchdog.md"),
    "# Watchdog\nSystem watchdog\n",
    "utf8"
  )

  await writeFile(
    path.join(systemPromptsDirectory, "task-profiles", "general-reminder.md"),
    "## Task Profile\nSystem general reminder profile\n",
    "utf8"
  )
  await writeFile(
    path.join(userPromptsDirectory, "task-profiles", "general-reminder.md"),
    "## Task Profile\nUser general reminder profile\n",
    "utf8"
  )
}

describe("task execution engine", () => {
  it("executes recurring due task and persists structured success result", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const db = openPersistenceDatabase({ dbPath: path.join(tempRoot, "state.db") })
    const jobsRepository = createJobsRepository(db)
    const jobRunSessionsRepository = createJobRunSessionsRepository(db)
    const sessionBindingsRepository = createSessionBindingsRepository(db)
    const outboundMessagesRepository = createOutboundMessagesRepository(db)
    await writeMinimalTaskConfig(tempRoot)
    await writeMinimalPromptWorkspace(tempRoot)

    jobsRepository.createTask({
      id: "job-recurring-1",
      type: "general-reminder",
      status: "idle",
      scheduleType: "recurring",
      profileId: null,
      modelRef: null,
      runAt: null,
      cadenceMinutes: 30,
      payload: JSON.stringify({ message: "Call Alice" }),
      lastRunAt: null,
      nextRunAt: 1_000,
      terminalState: null,
      terminalReason: null,
      lockToken: null,
      lockExpiresAt: null,
      createdAt: 100,
      updatedAt: 100,
    })

    const claimed = jobsRepository.claimDue(1_000, 10, "lock-1", 60_000, 1_000)[0]
    if (!claimed) {
      throw new Error("Expected due task claim")
    }

    const promptSession = vi.fn(async () =>
      JSON.stringify({
        status: "success",
        summary: "Reminder handled",
        errors: [],
      })
    )

    const logger = createLoggerStub()
    const engine = createTaskExecutionEngine({
      logger,
      ottoHome: tempRoot,
      jobsRepository,
      jobRunSessionsRepository,
      sessionBindingsRepository,
      outboundMessagesRepository,
      sessionGateway: {
        ensureSession: async () => "session-1",
        promptSession,
      },
      defaultWatchdogChatId: 777,
      userProfileRepository: {
        get: () => null,
        setLastDigestAt: () => {},
      },
      now: () => 2_000,
    })

    // Act
    await engine.executeClaimedJob(claimed)

    // Assert
    const runs = jobsRepository.listRunsByJobId("job-recurring-1")
    expect(runs[0]?.status).toBe("success")
    expect(runs[0]?.resultJson).toContain("Reminder handled")

    const task = jobsRepository.getById("job-recurring-1")
    expect(task?.status).toBe("idle")
    expect(task?.lockToken).toBeNull()
    expect(task?.nextRunAt).toBe(2_000 + 30 * 60_000)
    expect(promptSession).toHaveBeenCalledWith(
      "session-1",
      expect.stringContaining("Execute this scheduled Otto task now."),
      expect.objectContaining({
        systemPrompt: expect.stringContaining("## Surface\nScheduled surface"),
      })
    )

    db.close()
  })

  it("applies optional task-profile prompt layer for scheduled jobs", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const db = openPersistenceDatabase({ dbPath: path.join(tempRoot, "state.db") })
    const jobsRepository = createJobsRepository(db)
    const jobRunSessionsRepository = createJobRunSessionsRepository(db)
    const sessionBindingsRepository = createSessionBindingsRepository(db)
    const outboundMessagesRepository = createOutboundMessagesRepository(db)
    await writeMinimalTaskConfig(tempRoot)
    await writeMinimalPromptWorkspace(tempRoot)

    jobsRepository.createTask({
      id: "job-recurring-profile-1",
      type: "general-reminder",
      status: "idle",
      scheduleType: "recurring",
      profileId: "general-reminder",
      modelRef: null,
      runAt: null,
      cadenceMinutes: 30,
      payload: JSON.stringify({ message: "Call Alice" }),
      lastRunAt: null,
      nextRunAt: 1_000,
      terminalState: null,
      terminalReason: null,
      lockToken: null,
      lockExpiresAt: null,
      createdAt: 100,
      updatedAt: 100,
    })

    const claimed = jobsRepository.claimDue(1_000, 10, "lock-profile-1", 60_000, 1_000)[0]
    if (!claimed) {
      throw new Error("Expected due task claim")
    }

    const promptSession = vi.fn(async () =>
      JSON.stringify({
        status: "success",
        summary: "Reminder handled",
        errors: [],
      })
    )

    const logger = createLoggerStub()
    const engine = createTaskExecutionEngine({
      logger,
      ottoHome: tempRoot,
      jobsRepository,
      jobRunSessionsRepository,
      sessionBindingsRepository,
      outboundMessagesRepository,
      sessionGateway: {
        ensureSession: async () => "session-profile-1",
        promptSession,
      },
      defaultWatchdogChatId: 777,
      userProfileRepository: {
        get: () => null,
        setLastDigestAt: () => {},
      },
      now: () => 2_000,
    })

    // Act
    await engine.executeClaimedJob(claimed)

    // Assert
    expect(promptSession).toHaveBeenCalledWith(
      "session-profile-1",
      expect.any(String),
      expect.objectContaining({
        systemPrompt: expect.stringContaining("## Task Profile\nUser general reminder profile"),
      })
    )

    db.close()
  })

  it("classifies invalid assistant output as failed run for one-shot task", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const db = openPersistenceDatabase({ dbPath: path.join(tempRoot, "state.db") })
    const jobsRepository = createJobsRepository(db)
    const jobRunSessionsRepository = createJobRunSessionsRepository(db)
    const sessionBindingsRepository = createSessionBindingsRepository(db)
    const outboundMessagesRepository = createOutboundMessagesRepository(db)
    await writeMinimalTaskConfig(tempRoot)
    await writeMinimalPromptWorkspace(tempRoot)

    jobsRepository.createTask({
      id: "job-oneshot-1",
      type: "general-reminder",
      status: "idle",
      scheduleType: "oneshot",
      profileId: null,
      modelRef: null,
      runAt: 1_000,
      cadenceMinutes: null,
      payload: JSON.stringify({ message: "Ping team" }),
      lastRunAt: null,
      nextRunAt: 1_000,
      terminalState: null,
      terminalReason: null,
      lockToken: null,
      lockExpiresAt: null,
      createdAt: 100,
      updatedAt: 100,
    })

    const claimed = jobsRepository.claimDue(1_000, 10, "lock-2", 60_000, 1_000)[0]
    if (!claimed) {
      throw new Error("Expected due task claim")
    }

    const logger = createLoggerStub()
    const engine = createTaskExecutionEngine({
      logger,
      ottoHome: tempRoot,
      jobsRepository,
      jobRunSessionsRepository,
      sessionBindingsRepository,
      outboundMessagesRepository,
      sessionGateway: {
        ensureSession: async () => "session-2",
        promptSession: async () => "this is not valid json",
      },
      defaultWatchdogChatId: 777,
      userProfileRepository: {
        get: () => null,
        setLastDigestAt: () => {},
      },
      now: () => 3_000,
    })

    // Act
    await engine.executeClaimedJob(claimed)

    // Assert
    const runs = jobsRepository.listRunsByJobId("job-oneshot-1")
    expect(runs[0]?.status).toBe("failed")
    expect(runs[0]?.errorCode).toBe("invalid_result_json")
    expect(runs[0]?.resultJson).toContain("rawOutput")

    const task = jobsRepository.getById("job-oneshot-1")
    expect(task?.terminalState).toBe("completed")
    expect(task?.nextRunAt).toBeNull()

    db.close()
  })

  it("normalizes string-based errors from assistant output", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const db = openPersistenceDatabase({ dbPath: path.join(tempRoot, "state.db") })
    const jobsRepository = createJobsRepository(db)
    const jobRunSessionsRepository = createJobRunSessionsRepository(db)
    const sessionBindingsRepository = createSessionBindingsRepository(db)
    const outboundMessagesRepository = createOutboundMessagesRepository(db)
    await writeMinimalTaskConfig(tempRoot)
    await writeMinimalPromptWorkspace(tempRoot)

    jobsRepository.createTask({
      id: "job-oneshot-2",
      type: "general-reminder",
      status: "idle",
      scheduleType: "oneshot",
      profileId: null,
      modelRef: null,
      runAt: 1_000,
      cadenceMinutes: null,
      payload: JSON.stringify({ message: "Ping team" }),
      lastRunAt: null,
      nextRunAt: 1_000,
      terminalState: null,
      terminalReason: null,
      lockToken: null,
      lockExpiresAt: null,
      createdAt: 100,
      updatedAt: 100,
    })

    const claimed = jobsRepository.claimDue(1_000, 10, "lock-4", 60_000, 1_000)[0]
    if (!claimed) {
      throw new Error("Expected due task claim")
    }

    const logger = createLoggerStub()
    const engine = createTaskExecutionEngine({
      logger,
      ottoHome: tempRoot,
      jobsRepository,
      jobRunSessionsRepository,
      sessionBindingsRepository,
      outboundMessagesRepository,
      sessionGateway: {
        ensureSession: async () => "session-4",
        promptSession: async () =>
          JSON.stringify({
            status: "failed",
            summary: "Could not complete reminder",
            errors: ["telegram queue unavailable"],
          }),
      },
      defaultWatchdogChatId: 777,
      userProfileRepository: {
        get: () => null,
        setLastDigestAt: () => {},
      },
      now: () => 3_500,
    })

    // Act
    await engine.executeClaimedJob(claimed)

    // Assert
    const runs = jobsRepository.listRunsByJobId("job-oneshot-2")
    expect(runs[0]?.status).toBe("failed")
    expect(runs[0]?.errorCode).toBe("task_error")
    expect(runs[0]?.errorMessage).toBe("telegram queue unavailable")
    expect(runs[0]?.resultJson).toContain("telegram queue unavailable")
    expect(logger.warn).not.toHaveBeenCalled()

    db.close()
  })

  it("executes interactive background one-shot jobs with dedicated run session lifecycle", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const db = openPersistenceDatabase({ dbPath: path.join(tempRoot, "state.db") })
    const jobsRepository = createJobsRepository(db)
    const jobRunSessionsRepository = createJobRunSessionsRepository(db)
    const sessionBindingsRepository = createSessionBindingsRepository(db)
    const outboundMessagesRepository = createOutboundMessagesRepository(db)
    await writeMinimalTaskConfig(tempRoot)
    await writeMinimalPromptWorkspace(tempRoot)

    jobsRepository.createTask({
      id: "job-background-1",
      type: INTERACTIVE_BACKGROUND_ONESHOT_JOB_TYPE,
      status: "idle",
      scheduleType: "oneshot",
      profileId: null,
      modelRef: null,
      runAt: 4_000,
      cadenceMinutes: null,
      payload: JSON.stringify({
        version: 1,
        source: {
          surface: "interactive",
          sessionId: "session-origin-1",
          sourceMessageId: "telegram-msg-1",
          chatId: 777,
        },
        request: {
          text: "Draft a migration plan for this repository",
          requestedAt: 3_900,
          rationale: "Long-running architecture analysis",
        },
      }),
      lastRunAt: null,
      nextRunAt: 4_000,
      terminalState: null,
      terminalReason: null,
      lockToken: null,
      lockExpiresAt: null,
      createdAt: 3_900,
      updatedAt: 3_900,
    })

    const claimed = jobsRepository.claimDue(4_000, 10, "lock-background-1", 60_000, 4_000)[0]
    if (!claimed) {
      throw new Error("Expected due background task claim")
    }

    const closeSession = vi.fn(async () => {})
    const promptSession = vi.fn(async () =>
      JSON.stringify({
        status: "success",
        summary: "Background execution completed with final deliverable.",
        errors: [],
      })
    )
    const logger = createLoggerStub()
    const engine = createTaskExecutionEngine({
      logger,
      ottoHome: tempRoot,
      jobsRepository,
      jobRunSessionsRepository,
      sessionBindingsRepository,
      outboundMessagesRepository,
      sessionGateway: {
        ensureSession: async () => "session-background-run-1",
        closeSession,
        promptSession,
      },
      defaultWatchdogChatId: 777,
      userProfileRepository: {
        get: () => null,
        setLastDigestAt: () => {},
      },
      now: () => 4_500,
    })

    // Act
    await engine.executeClaimedJob(claimed)

    // Assert
    const runs = jobsRepository.listRunsByJobId("job-background-1")
    expect(runs[0]?.status).toBe("success")
    expect(runs[0]?.resultJson).toContain("Background execution completed")

    const runSession = db
      .prepare(
        `SELECT
          run_id as runId,
          job_id as jobId,
          session_id as sessionId,
          closed_at as closedAt,
          close_error_message as closeErrorMessage
         FROM job_run_sessions
         WHERE run_id = ?`
      )
      .get(runs[0]?.id) as {
      runId: string
      jobId: string
      sessionId: string
      closedAt: number | null
      closeErrorMessage: string | null
    }

    expect(runSession).toMatchObject({
      jobId: "job-background-1",
      sessionId: "session-background-run-1",
      closeErrorMessage: null,
    })
    expect(runSession.closedAt).toBe(4_500)
    expect(closeSession).toHaveBeenCalledWith("session-background-run-1")
    expect(promptSession).toHaveBeenCalledWith(
      "session-background-run-1",
      expect.stringContaining("Execute this interactive background request now."),
      expect.objectContaining({
        systemPrompt: expect.stringContaining("## Surface\nBackground surface"),
      })
    )
    expect(promptSession).toHaveBeenCalledWith(
      "session-background-run-1",
      expect.any(String),
      expect.objectContaining({
        systemPrompt: expect.stringContaining("## Media\nChatapps media"),
      })
    )

    const task = jobsRepository.getById("job-background-1")
    expect(task?.terminalState).toBe("completed")
    expect(task?.nextRunAt).toBeNull()

    db.close()
  })

  it("records session close errors for interactive background runs", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const db = openPersistenceDatabase({ dbPath: path.join(tempRoot, "state.db") })
    const jobsRepository = createJobsRepository(db)
    const jobRunSessionsRepository = createJobRunSessionsRepository(db)
    const sessionBindingsRepository = createSessionBindingsRepository(db)
    const outboundMessagesRepository = createOutboundMessagesRepository(db)
    await writeMinimalTaskConfig(tempRoot)

    jobsRepository.createTask({
      id: "job-background-2",
      type: INTERACTIVE_BACKGROUND_ONESHOT_JOB_TYPE,
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
          text: "Prepare weekly summary",
          requestedAt: 4_900,
          rationale: null,
        },
      }),
      lastRunAt: null,
      nextRunAt: 5_000,
      terminalState: null,
      terminalReason: null,
      lockToken: null,
      lockExpiresAt: null,
      createdAt: 4_900,
      updatedAt: 4_900,
    })

    const claimed = jobsRepository.claimDue(5_000, 10, "lock-background-2", 60_000, 5_000)[0]
    if (!claimed) {
      throw new Error("Expected due background task claim")
    }

    const logger = createLoggerStub()
    const engine = createTaskExecutionEngine({
      logger,
      ottoHome: tempRoot,
      jobsRepository,
      jobRunSessionsRepository,
      sessionBindingsRepository,
      outboundMessagesRepository,
      sessionGateway: {
        ensureSession: async () => "session-background-run-2",
        closeSession: async () => {
          throw new Error("close failed")
        },
        promptSession: async () =>
          JSON.stringify({
            status: "success",
            summary: "Done.",
            errors: [],
          }),
      },
      defaultWatchdogChatId: 777,
      userProfileRepository: {
        get: () => null,
        setLastDigestAt: () => {},
      },
      now: () => 5_500,
    })

    // Act
    await engine.executeClaimedJob(claimed)

    // Assert
    const run = jobsRepository.listRunsByJobId("job-background-2")[0]
    const runSession = db
      .prepare(
        "SELECT close_error_message as closeErrorMessage FROM job_run_sessions WHERE run_id = ?"
      )
      .get(run?.id) as { closeErrorMessage: string | null }

    expect(runSession.closeErrorMessage).toBe("close failed")
    expect(logger.warn).toHaveBeenCalled()

    db.close()
  })

  it("classifies non-JSON interactive background output as failed run", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const db = openPersistenceDatabase({ dbPath: path.join(tempRoot, "state.db") })
    const jobsRepository = createJobsRepository(db)
    const jobRunSessionsRepository = createJobRunSessionsRepository(db)
    const sessionBindingsRepository = createSessionBindingsRepository(db)
    const outboundMessagesRepository = createOutboundMessagesRepository(db)
    await writeMinimalTaskConfig(tempRoot)

    jobsRepository.createTask({
      id: "job-background-3",
      type: INTERACTIVE_BACKGROUND_ONESHOT_JOB_TYPE,
      status: "idle",
      scheduleType: "oneshot",
      profileId: null,
      modelRef: null,
      runAt: 6_000,
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
          text: "Analyze production issue",
          requestedAt: 5_900,
          rationale: null,
        },
      }),
      lastRunAt: null,
      nextRunAt: 6_000,
      terminalState: null,
      terminalReason: null,
      lockToken: null,
      lockExpiresAt: null,
      createdAt: 5_900,
      updatedAt: 5_900,
    })

    const claimed = jobsRepository.claimDue(6_000, 10, "lock-background-3", 60_000, 6_000)[0]
    if (!claimed) {
      throw new Error("Expected due background task claim")
    }

    const logger = createLoggerStub()
    const engine = createTaskExecutionEngine({
      logger,
      ottoHome: tempRoot,
      jobsRepository,
      jobRunSessionsRepository,
      sessionBindingsRepository,
      outboundMessagesRepository,
      sessionGateway: {
        ensureSession: async () => "session-background-run-3",
        closeSession: async () => {},
        promptSession: async () => "I could not complete this request.",
      },
      defaultWatchdogChatId: 777,
      userProfileRepository: {
        get: () => null,
        setLastDigestAt: () => {},
      },
      now: () => 6_500,
    })

    // Act
    await engine.executeClaimedJob(claimed)

    // Assert
    const run = jobsRepository.listRunsByJobId("job-background-3")[0]
    expect(run?.status).toBe("failed")
    expect(run?.errorCode).toBe("invalid_result_json")

    db.close()
  })

  it("executes watchdog task and queues alert through existing outbound infrastructure", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const db = openPersistenceDatabase({ dbPath: path.join(tempRoot, "state.db") })
    const jobsRepository = createJobsRepository(db)
    const jobRunSessionsRepository = createJobRunSessionsRepository(db)
    const sessionBindingsRepository = createSessionBindingsRepository(db)
    const outboundMessagesRepository = createOutboundMessagesRepository(db)
    await writeMinimalTaskConfig(tempRoot)
    await writeMinimalPromptWorkspace(tempRoot, {
      userMapping: {
        version: 1,
        selectors: {
          watchdog: {
            default: "watchdog-user",
          },
        },
        routes: {
          "watchdog-default": {
            layers: {
              "core-persona": {
                source: "user",
                path: "layers/watchdog-user.md",
              },
            },
          },
          "watchdog-user": {
            layers: {
              "core-persona": {
                source: "user",
                path: "layers/watchdog-user.md",
              },
            },
          },
        },
      },
    })
    await writeFile(
      path.join(tempRoot, "prompts", "layers", "watchdog-user.md"),
      "# User\n",
      "utf8"
    )

    jobsRepository.createTask({
      id: "task-failed-1",
      type: "email-triage",
      status: "paused",
      scheduleType: "recurring",
      profileId: null,
      modelRef: null,
      runAt: null,
      cadenceMinutes: 30,
      payload: null,
      lastRunAt: null,
      nextRunAt: null,
      terminalState: null,
      terminalReason: null,
      lockToken: null,
      lockExpiresAt: null,
      createdAt: 100,
      updatedAt: 100,
    })
    jobsRepository.insertRun({
      id: "run-failed-1",
      jobId: "task-failed-1",
      scheduledFor: 1_000,
      startedAt: 1_100,
      finishedAt: null,
      status: "skipped",
      errorCode: null,
      errorMessage: null,
      resultJson: null,
      createdAt: 1_100,
    })
    jobsRepository.markRunFinished(
      "run-failed-1",
      "failed",
      1_150,
      "tool_failure",
      "Tool call failed",
      null
    )

    jobsRepository.createTask({
      id: "watchdog-task-1",
      type: "watchdog_failures",
      status: "idle",
      scheduleType: "recurring",
      profileId: null,
      modelRef: null,
      runAt: null,
      cadenceMinutes: 30,
      payload: JSON.stringify({
        lookbackMinutes: 120,
        maxFailures: 20,
        threshold: 1,
        notify: true,
      }),
      lastRunAt: null,
      nextRunAt: 2_000,
      terminalState: null,
      terminalReason: null,
      lockToken: null,
      lockExpiresAt: null,
      createdAt: 100,
      updatedAt: 100,
    })

    const claimed = jobsRepository.claimDue(2_000, 10, "lock-3", 60_000, 2_000)[0]
    if (!claimed) {
      throw new Error("Expected due watchdog claim")
    }

    const logger = createLoggerStub()
    const engine = createTaskExecutionEngine({
      logger,
      ottoHome: tempRoot,
      jobsRepository,
      jobRunSessionsRepository,
      sessionBindingsRepository,
      outboundMessagesRepository,
      sessionGateway: {
        ensureSession: async () => "session-3",
        promptSession: async () =>
          JSON.stringify({
            status: "success",
            summary: "unused",
            errors: [],
          }),
      },
      defaultWatchdogChatId: 777,
      userProfileRepository: {
        get: () => null,
        setLastDigestAt: () => {},
      },
      now: () => 2_500,
    })

    // Act
    await engine.executeClaimedJob(claimed)

    // Assert
    const runs = jobsRepository.listRunsByJobId("watchdog-task-1")
    expect(runs[0]?.status).toBe("success")
    expect(runs[0]?.resultJson).toContain("Watchdog checked")
    expect(outboundMessagesRepository.listDue(10_000)).toHaveLength(1)
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ warningCode: "watchdog_user_override_blocked" }),
      expect.stringContaining("watchdog")
    )

    db.close()
  })
})
