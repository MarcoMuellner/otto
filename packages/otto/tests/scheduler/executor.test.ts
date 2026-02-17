import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"

import {
  createJobsRepository,
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
}

describe("task execution engine", () => {
  it("executes recurring due task and persists structured success result", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const db = openPersistenceDatabase({ dbPath: path.join(tempRoot, "state.db") })
    const jobsRepository = createJobsRepository(db)
    const sessionBindingsRepository = createSessionBindingsRepository(db)
    const outboundMessagesRepository = createOutboundMessagesRepository(db)
    await writeMinimalTaskConfig(tempRoot)

    jobsRepository.createTask({
      id: "job-recurring-1",
      type: "general-reminder",
      status: "idle",
      scheduleType: "recurring",
      profileId: null,
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

    const engine = createTaskExecutionEngine({
      logger: createLoggerStub(),
      ottoHome: tempRoot,
      jobsRepository,
      sessionBindingsRepository,
      outboundMessagesRepository,
      sessionGateway: {
        ensureSession: async () => "session-1",
        promptSession: async () =>
          JSON.stringify({
            status: "success",
            summary: "Reminder handled",
            errors: [],
          }),
      },
      defaultWatchdogChatId: 777,
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

    db.close()
  })

  it("classifies invalid assistant output as failed run for one-shot task", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const db = openPersistenceDatabase({ dbPath: path.join(tempRoot, "state.db") })
    const jobsRepository = createJobsRepository(db)
    const sessionBindingsRepository = createSessionBindingsRepository(db)
    const outboundMessagesRepository = createOutboundMessagesRepository(db)
    await writeMinimalTaskConfig(tempRoot)

    jobsRepository.createTask({
      id: "job-oneshot-1",
      type: "general-reminder",
      status: "idle",
      scheduleType: "oneshot",
      profileId: null,
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

    const engine = createTaskExecutionEngine({
      logger: createLoggerStub(),
      ottoHome: tempRoot,
      jobsRepository,
      sessionBindingsRepository,
      outboundMessagesRepository,
      sessionGateway: {
        ensureSession: async () => "session-2",
        promptSession: async () => "this is not valid json",
      },
      defaultWatchdogChatId: 777,
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
    const sessionBindingsRepository = createSessionBindingsRepository(db)
    const outboundMessagesRepository = createOutboundMessagesRepository(db)
    await writeMinimalTaskConfig(tempRoot)

    jobsRepository.createTask({
      id: "job-oneshot-2",
      type: "general-reminder",
      status: "idle",
      scheduleType: "oneshot",
      profileId: null,
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

  it("executes watchdog task and queues alert through existing outbound infrastructure", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const db = openPersistenceDatabase({ dbPath: path.join(tempRoot, "state.db") })
    const jobsRepository = createJobsRepository(db)
    const sessionBindingsRepository = createSessionBindingsRepository(db)
    const outboundMessagesRepository = createOutboundMessagesRepository(db)
    await writeMinimalTaskConfig(tempRoot)

    jobsRepository.createTask({
      id: "task-failed-1",
      type: "email-triage",
      status: "paused",
      scheduleType: "recurring",
      profileId: null,
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

    const engine = createTaskExecutionEngine({
      logger: createLoggerStub(),
      ottoHome: tempRoot,
      jobsRepository,
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
      now: () => 2_500,
    })

    // Act
    await engine.executeClaimedJob(claimed)

    // Assert
    const runs = jobsRepository.listRunsByJobId("watchdog-task-1")
    expect(runs[0]?.status).toBe("success")
    expect(runs[0]?.resultJson).toContain("Watchdog checked")
    expect(outboundMessagesRepository.listDue(10_000)).toHaveLength(1)

    db.close()
  })
})
