import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import { createJobsRepository, openPersistenceDatabase } from "../../src/persistence/index.js"
import {
  EOD_LEARNING_TASK_ID,
  EOD_LEARNING_TASK_TYPE,
  ensureEodLearningTask,
  resolveEodLearningTimezone,
  resolveNextLocalMidnightTimestamp,
} from "../../src/scheduler/eod-learning.js"

const TEMP_PREFIX = path.join(tmpdir(), "otto-eod-learning-")
const cleanupPaths: string[] = []

afterEach(async () => {
  await Promise.all(
    cleanupPaths.splice(0).map(async (directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe("eod-learning scheduler bootstrap", () => {
  it("resolves timezone from profile value with default fallback", () => {
    // Arrange
    const validTimezone = "Europe/Vienna"
    const invalidTimezone = "not-a-real-timezone"

    // Act
    const resolvedValid = resolveEodLearningTimezone(validTimezone)
    const resolvedInvalid = resolveEodLearningTimezone(invalidTimezone)
    const resolvedMissing = resolveEodLearningTimezone(null)

    // Assert
    expect(resolvedValid).toBe("Europe/Vienna")
    expect(resolvedInvalid).toBe("Europe/Vienna")
    expect(resolvedMissing).toBe("Europe/Vienna")
  })

  it("computes next local midnight for timezone without UTC drift", () => {
    // Arrange
    const timezone = "Europe/Vienna"
    const nowTimestamp = Date.parse("2026-01-10T10:15:00.000Z")

    // Act
    const nextRunAt = resolveNextLocalMidnightTimestamp(timezone, nowTimestamp)

    // Assert
    expect(nextRunAt).toBe(Date.parse("2026-01-10T23:00:00.000Z"))
  })

  it("keeps midnight-local semantics across DST transitions", () => {
    // Arrange
    const timezone = "Europe/Vienna"
    const springDstNow = Date.parse("2026-03-29T12:00:00.000Z")
    const fallDstNow = Date.parse("2026-10-25T12:00:00.000Z")

    // Act
    const springNext = resolveNextLocalMidnightTimestamp(timezone, springDstNow)
    const fallNext = resolveNextLocalMidnightTimestamp(timezone, fallDstNow)

    // Assert
    expect(springNext).toBe(Date.parse("2026-03-29T22:00:00.000Z"))
    expect(fallNext).toBe(Date.parse("2026-10-25T23:00:00.000Z"))
  })

  it("creates EOD task once and keeps bootstrap idempotent", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const db = openPersistenceDatabase({ dbPath: path.join(tempRoot, "state.db") })
    const jobsRepository = createJobsRepository(db)

    // Act
    const first = ensureEodLearningTask(
      jobsRepository,
      {
        timezone: "Europe/Vienna",
      },
      () => Date.parse("2026-01-10T10:15:00.000Z")
    )
    const second = ensureEodLearningTask(
      jobsRepository,
      {
        timezone: "America/New_York",
      },
      () => Date.parse("2026-01-10T18:30:00.000Z")
    )

    // Assert
    expect(first.created).toBe(true)
    expect(first.taskId).toBe(EOD_LEARNING_TASK_ID)
    expect(first.timezone).toBe("Europe/Vienna")
    expect(first.nextRunAt).toBe(Date.parse("2026-01-10T23:00:00.000Z"))

    expect(second.created).toBe(false)
    expect(second.taskId).toBe(EOD_LEARNING_TASK_ID)
    expect(second.timezone).toBe("Europe/Vienna")
    expect(second.cadenceMinutes).toBe(24 * 60)

    const task = jobsRepository.getById(EOD_LEARNING_TASK_ID)
    expect(task?.type).toBe(EOD_LEARNING_TASK_TYPE)
    expect(task?.scheduleType).toBe("recurring")
    expect(task?.nextRunAt).toBe(Date.parse("2026-01-10T23:00:00.000Z"))
    expect(task?.payload).toContain("Europe/Vienna")

    db.close()
  })
})
