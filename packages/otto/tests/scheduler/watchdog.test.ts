import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import {
  createJobsRepository,
  createOutboundMessagesRepository,
  openPersistenceDatabase,
} from "../../src/persistence/index.js"
import {
  checkTaskFailures,
  ensureWatchdogTask,
  resolveDefaultWatchdogChatId,
  WATCHDOG_TASK_ID,
} from "../../src/scheduler/watchdog.js"

const TEMP_PREFIX = path.join(tmpdir(), "otto-watchdog-")
const cleanupPaths: string[] = []

afterEach(async () => {
  await Promise.all(
    cleanupPaths.splice(0).map(async (directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe("watchdog", () => {
  it("resolves default chat id from env first, then telegram credentials", () => {
    // Arrange
    const envPreferred = {
      TELEGRAM_ALLOWED_USER_ID: "123",
    } as NodeJS.ProcessEnv
    const fallbackCredentials = {
      botToken: "token",
      allowedUserId: 456,
    }

    // Act
    const fromEnv = resolveDefaultWatchdogChatId(envPreferred, fallbackCredentials)
    const fromCredentials = resolveDefaultWatchdogChatId({}, fallbackCredentials)
    const missing = resolveDefaultWatchdogChatId({}, { botToken: "token", allowedUserId: null })

    // Assert
    expect(fromEnv).toBe(123)
    expect(fromCredentials).toBe(456)
    expect(missing).toBeNull()
  })

  it("creates watchdog task once and keeps it idempotent", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const db = openPersistenceDatabase({ dbPath: path.join(tempRoot, "state.db") })
    const jobsRepository = createJobsRepository(db)

    // Act
    const first = ensureWatchdogTask(
      jobsRepository,
      {
        cadenceMinutes: 30,
        chatId: 777,
      },
      () => 1_000
    )
    const second = ensureWatchdogTask(jobsRepository, {}, () => 2_000)

    // Assert
    expect(first.created).toBe(true)
    expect(second.created).toBe(false)

    const task = jobsRepository.getById(WATCHDOG_TASK_ID)
    expect(task?.type).toBe("watchdog_failures")
    expect(task?.scheduleType).toBe("recurring")
    expect(task?.cadenceMinutes).toBe(30)
    expect(task?.nextRunAt).toBe(1_000 + 30 * 60_000)

    db.close()
  })

  it("queues dedupe-safe watchdog alert for repeated failure window", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const db = openPersistenceDatabase({ dbPath: path.join(tempRoot, "state.db") })
    const jobsRepository = createJobsRepository(db)
    const outboundMessagesRepository = createOutboundMessagesRepository(db)

    jobsRepository.createTask({
      id: "task-1",
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
      id: "run-1",
      jobId: "task-1",
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
      "run-1",
      "failed",
      1_120,
      "execution_timeout",
      "Execution timed out",
      null
    )

    // Act
    const first = checkTaskFailures(
      {
        jobsRepository,
        outboundMessagesRepository,
        defaultChatId: 777,
      },
      {
        lookbackMinutes: 120,
        maxFailures: 20,
        threshold: 1,
        notify: true,
      },
      () => 5_000
    )

    const second = checkTaskFailures(
      {
        jobsRepository,
        outboundMessagesRepository,
        defaultChatId: 777,
      },
      {
        lookbackMinutes: 120,
        maxFailures: 20,
        threshold: 1,
        notify: true,
      },
      () => 5_000
    )

    // Assert
    expect(first.notificationStatus).toBe("enqueued")
    expect(second.notificationStatus).toBe("duplicate")
    expect(first.failedCount).toBe(1)
    expect(second.failedCount).toBe(1)
    expect(outboundMessagesRepository.listDue(10_000)).toHaveLength(1)

    db.close()
  })

  it("summarizes noisy failure reasons into compact grouped alert lines", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const db = openPersistenceDatabase({ dbPath: path.join(tempRoot, "state.db") })
    const jobsRepository = createJobsRepository(db)
    const outboundMessagesRepository = createOutboundMessagesRepository(db)

    jobsRepository.createTask({
      id: "task-a",
      type: "interactive_background_oneshot",
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
    jobsRepository.createTask({
      id: "task-b",
      type: "lueften_watch",
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

    const zodIssuePayload = JSON.stringify([
      {
        code: "invalid_value",
        values: [1],
        path: ["version"],
        message: "Invalid input",
      },
      {
        expected: "object",
        code: "invalid_type",
        path: ["source"],
        message: "Invalid input",
      },
      {
        expected: "object",
        code: "invalid_type",
        path: ["request"],
        message: "Invalid input",
      },
    ])

    jobsRepository.insertRun({
      id: "run-a-1",
      jobId: "task-a",
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
      "run-a-1",
      "failed",
      1_120,
      "validation_error",
      zodIssuePayload,
      null
    )

    jobsRepository.insertRun({
      id: "run-a-2",
      jobId: "task-a",
      scheduledFor: 2_000,
      startedAt: 2_100,
      finishedAt: null,
      status: "skipped",
      errorCode: null,
      errorMessage: null,
      resultJson: null,
      createdAt: 2_100,
    })
    jobsRepository.markRunFinished(
      "run-a-2",
      "failed",
      2_120,
      "validation_error",
      zodIssuePayload,
      null
    )

    jobsRepository.insertRun({
      id: "run-b-1",
      jobId: "task-b",
      scheduledFor: 3_000,
      startedAt: 3_100,
      finishedAt: null,
      status: "skipped",
      errorCode: null,
      errorMessage: null,
      resultJson: null,
      createdAt: 3_100,
    })
    jobsRepository.markRunFinished(
      "run-b-1",
      "failed",
      3_120,
      "execution_timeout",
      "timeout while executing scheduled lueften run",
      null
    )

    // Act
    checkTaskFailures(
      {
        jobsRepository,
        outboundMessagesRepository,
        defaultChatId: 777,
      },
      {
        lookbackMinutes: 120,
        maxFailures: 20,
        threshold: 1,
        notify: true,
      },
      () => 5_000
    )
    const [queuedMessage] = outboundMessagesRepository.listDue(10_000)

    // Assert
    expect(queuedMessage?.content).toContain(
      "Watchdog alert: 3 failed task runs in last 120m (threshold 1)."
    )
    expect(queuedMessage?.content).toContain(
      "- 2x interactive_background_oneshot: validation failed (version, source, request)"
    )
    expect(queuedMessage?.content).toContain(
      "- lueften_watch: timeout while executing scheduled lueften run"
    )
    expect(queuedMessage?.content).not.toContain('"expected":"object"')

    db.close()
  })
})
