import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"

import { createJobsRepository, openPersistenceDatabase } from "../../src/persistence/index.js"
import { EOD_LEARNING_TASK_ID } from "../../src/scheduler/eod-learning.js"
import { WATCHDOG_TASK_ID } from "../../src/scheduler/watchdog.js"
import { ensureSystemBootstrapTasks } from "../../src/runtime/serve.js"

const TEMP_PREFIX = path.join(tmpdir(), "otto-serve-bootstrap-")
const cleanupPaths: string[] = []

afterEach(async () => {
  await Promise.all(
    cleanupPaths.splice(0).map(async (directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe("serve bootstrap task wiring", () => {
  it("ensures watchdog and EOD tasks at startup with timezone-aware logging", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const db = openPersistenceDatabase({ dbPath: path.join(tempRoot, "state.db") })
    const jobsRepository = createJobsRepository(db)
    const logger = {
      info: vi.fn(),
    }

    // Act
    ensureSystemBootstrapTasks({
      logger,
      jobsRepository,
      timezone: "Europe/Vienna",
      watchdogChatId: 777,
      now: () => Date.parse("2026-01-10T10:15:00.000Z"),
    })

    // Assert
    expect(jobsRepository.getById(WATCHDOG_TASK_ID)).not.toBeNull()
    expect(jobsRepository.getById(EOD_LEARNING_TASK_ID)).not.toBeNull()

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: WATCHDOG_TASK_ID,
        created: true,
      }),
      "Watchdog task ensured"
    )
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: EOD_LEARNING_TASK_ID,
        created: true,
        timezone: "Europe/Vienna",
      }),
      "EOD learning task ensured"
    )

    db.close()
  })

  it("keeps startup bootstrap idempotent across restarts", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const db = openPersistenceDatabase({ dbPath: path.join(tempRoot, "state.db") })
    const jobsRepository = createJobsRepository(db)
    const logger = {
      info: vi.fn(),
    }

    ensureSystemBootstrapTasks({
      logger,
      jobsRepository,
      timezone: "Europe/Vienna",
      watchdogChatId: 777,
      now: () => Date.parse("2026-01-10T10:15:00.000Z"),
    })

    // Act
    ensureSystemBootstrapTasks({
      logger,
      jobsRepository,
      timezone: "Europe/Vienna",
      watchdogChatId: 777,
      now: () => Date.parse("2026-01-10T11:15:00.000Z"),
    })

    // Assert
    const watchdog = jobsRepository.getById(WATCHDOG_TASK_ID)
    const eod = jobsRepository.getById(EOD_LEARNING_TASK_ID)
    expect(watchdog).not.toBeNull()
    expect(eod).not.toBeNull()

    expect(logger.info).toHaveBeenLastCalledWith(
      expect.objectContaining({
        taskId: EOD_LEARNING_TASK_ID,
        created: false,
      }),
      "EOD learning task ensured"
    )

    db.close()
  })
})
