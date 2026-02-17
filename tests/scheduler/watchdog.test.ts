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
})
