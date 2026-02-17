import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import {
  createApprovalsRepository,
  createCommandAuditRepository,
  createJobsRepository,
  createOutboundMessagesRepository,
  createSessionBindingsRepository,
  createTaskAuditRepository,
  createTaskObservationsRepository,
  createUserProfileRepository,
  openPersistenceDatabase,
} from "../../src/persistence/index.js"

const TEMP_PREFIX = path.join(tmpdir(), "otto-repos-")
const cleanupPaths: string[] = []

afterEach(async () => {
  await Promise.all(
    cleanupPaths.splice(0).map(async (directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe("persistence repositories", () => {
  it("stores and retrieves session bindings", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const db = openPersistenceDatabase({ dbPath: path.join(tempRoot, "state.db") })
    const repository = createSessionBindingsRepository(db)

    // Act
    repository.upsert("telegram:chat:1", "session-123", 1000)
    const record = repository.getByBindingKey("telegram:chat:1")

    // Assert
    expect(record).toEqual({
      bindingKey: "telegram:chat:1",
      sessionId: "session-123",
      updatedAt: 1000,
    })

    db.close()
  })

  it("queues outbound messages and marks delivery", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const db = openPersistenceDatabase({ dbPath: path.join(tempRoot, "state.db") })
    const repository = createOutboundMessagesRepository(db)
    repository.enqueue({
      id: "out-1",
      dedupeKey: "dedupe-1",
      chatId: 42,
      content: "ping",
      priority: "normal",
      status: "queued",
      attemptCount: 0,
      nextAttemptAt: 500,
      sentAt: null,
      failedAt: null,
      errorMessage: null,
      createdAt: 100,
      updatedAt: 100,
    })

    // Act
    const due = repository.listDue(500)
    repository.markSent("out-1", 1, 600)

    // Assert
    expect(due).toHaveLength(1)
    expect(due[0]?.id).toBe("out-1")
    const updated = db
      .prepare(
        "SELECT status, attempt_count as attemptCount, sent_at as sentAt, error_message as errorMessage FROM messages_out WHERE id = ?"
      )
      .get("out-1") as {
      status: string
      attemptCount: number
      sentAt: number
      errorMessage: string | null
    }
    expect(updated).toEqual({ status: "sent", attemptCount: 1, sentAt: 600, errorMessage: null })

    db.close()
  })

  it("supports dedupe-safe enqueue plus retry and permanent failure updates", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const db = openPersistenceDatabase({ dbPath: path.join(tempRoot, "state.db") })
    const repository = createOutboundMessagesRepository(db)

    // Act
    const firstInsert = repository.enqueueOrIgnoreDedupe({
      id: "out-retry-1",
      dedupeKey: "dedupe-retry",
      chatId: 42,
      content: "retry me",
      priority: "high",
      status: "queued",
      attemptCount: 0,
      nextAttemptAt: 100,
      sentAt: null,
      failedAt: null,
      errorMessage: null,
      createdAt: 100,
      updatedAt: 100,
    })
    const duplicateInsert = repository.enqueueOrIgnoreDedupe({
      id: "out-retry-2",
      dedupeKey: "dedupe-retry",
      chatId: 42,
      content: "retry me again",
      priority: "high",
      status: "queued",
      attemptCount: 0,
      nextAttemptAt: 100,
      sentAt: null,
      failedAt: null,
      errorMessage: null,
      createdAt: 100,
      updatedAt: 100,
    })
    repository.markRetry("out-retry-1", 1, 1_000, "timeout", 500)
    repository.markFailed("out-retry-1", 5, "rate limited", 900)

    // Assert
    expect(firstInsert).toBe("enqueued")
    expect(duplicateInsert).toBe("duplicate")
    const updated = db
      .prepare(
        "SELECT status, attempt_count as attemptCount, next_attempt_at as nextAttemptAt, failed_at as failedAt, error_message as errorMessage FROM messages_out WHERE id = ?"
      )
      .get("out-retry-1") as {
      status: string
      attemptCount: number
      nextAttemptAt: number | null
      failedAt: number | null
      errorMessage: string | null
    }
    expect(updated).toEqual({
      status: "failed",
      attemptCount: 5,
      nextAttemptAt: null,
      failedAt: 900,
      errorMessage: "rate limited",
    })

    db.close()
  })

  it("tracks due scheduler jobs", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const db = openPersistenceDatabase({ dbPath: path.join(tempRoot, "state.db") })
    const repository = createJobsRepository(db)
    repository.upsert({
      id: "job-1",
      type: "oneshot",
      status: "idle",
      scheduleType: "oneshot",
      profileId: null,
      runAt: 1000,
      cadenceMinutes: null,
      payload: null,
      lastRunAt: null,
      nextRunAt: 1000,
      terminalState: null,
      terminalReason: null,
      lockToken: null,
      lockExpiresAt: null,
      createdAt: 100,
      updatedAt: 100,
    })

    // Act
    const due = repository.listDue(1000)

    // Assert
    expect(due).toHaveLength(1)
    expect(due[0]?.id).toBe("job-1")

    db.close()
  })

  it("claims due jobs with lock lease and supports lock release", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const db = openPersistenceDatabase({ dbPath: path.join(tempRoot, "state.db") })
    const repository = createJobsRepository(db)

    repository.upsert({
      id: "job-due-1",
      type: "oneshot_tick",
      status: "idle",
      scheduleType: "recurring",
      profileId: null,
      runAt: null,
      cadenceMinutes: 1,
      payload: null,
      lastRunAt: null,
      nextRunAt: 1_000,
      terminalState: null,
      terminalReason: null,
      lockToken: null,
      lockExpiresAt: null,
      createdAt: 100,
      updatedAt: 100,
    })
    repository.upsert({
      id: "job-future",
      type: "oneshot_tick",
      status: "idle",
      scheduleType: "recurring",
      profileId: null,
      runAt: null,
      cadenceMinutes: 1,
      payload: null,
      lastRunAt: null,
      nextRunAt: 9_999,
      terminalState: null,
      terminalReason: null,
      lockToken: null,
      lockExpiresAt: null,
      createdAt: 100,
      updatedAt: 100,
    })
    repository.upsert({
      id: "job-paused",
      type: "oneshot_tick",
      status: "paused",
      scheduleType: "recurring",
      profileId: null,
      runAt: null,
      cadenceMinutes: 1,
      payload: null,
      lastRunAt: null,
      nextRunAt: 1_000,
      terminalState: null,
      terminalReason: null,
      lockToken: null,
      lockExpiresAt: null,
      createdAt: 100,
      updatedAt: 100,
    })

    // Act
    const claimed = repository.claimDue(1_000, 10, "lock-1", 60_000, 1_000)

    // Assert
    expect(claimed).toHaveLength(1)
    expect(claimed[0]?.id).toBe("job-due-1")

    const claimedAgain = repository.claimDue(1_100, 10, "lock-2", 60_000, 1_100)
    expect(claimedAgain).toHaveLength(0)

    repository.releaseLock("job-due-1", "lock-1", 1_200)
    const reclaimed = repository.claimDue(1_300, 10, "lock-3", 60_000, 1_300)
    expect(reclaimed).toHaveLength(1)
    expect(reclaimed[0]?.id).toBe("job-due-1")

    db.close()
  })

  it("reclaims jobs when lock lease is expired", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const db = openPersistenceDatabase({ dbPath: path.join(tempRoot, "state.db") })
    const repository = createJobsRepository(db)

    repository.upsert({
      id: "job-expired-lock",
      type: "oneshot_tick",
      status: "running",
      scheduleType: "recurring",
      profileId: null,
      runAt: null,
      cadenceMinutes: 1,
      payload: null,
      lastRunAt: null,
      nextRunAt: 1_000,
      terminalState: null,
      terminalReason: null,
      lockToken: "stale-lock",
      lockExpiresAt: 1_050,
      createdAt: 100,
      updatedAt: 100,
    })

    // Act
    const reclaimed = repository.claimDue(1_100, 10, "fresh-lock", 60_000, 1_100)

    // Assert
    expect(reclaimed).toHaveLength(1)
    expect(reclaimed[0]?.id).toBe("job-expired-lock")

    db.close()
  })

  it("stores job runs and updates recurring or one-shot schedule state", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const db = openPersistenceDatabase({ dbPath: path.join(tempRoot, "state.db") })
    const repository = createJobsRepository(db)

    repository.upsert({
      id: "job-recurring",
      type: "reminder",
      status: "idle",
      scheduleType: "recurring",
      profileId: null,
      runAt: null,
      cadenceMinutes: 30,
      payload: null,
      lastRunAt: null,
      nextRunAt: 1_000,
      terminalState: null,
      terminalReason: null,
      lockToken: null,
      lockExpiresAt: null,
      createdAt: 100,
      updatedAt: 100,
    })
    repository.upsert({
      id: "job-oneshot",
      type: "reminder",
      status: "idle",
      scheduleType: "oneshot",
      profileId: null,
      runAt: 2_000,
      cadenceMinutes: null,
      payload: null,
      lastRunAt: null,
      nextRunAt: 2_000,
      terminalState: null,
      terminalReason: null,
      lockToken: null,
      lockExpiresAt: null,
      createdAt: 100,
      updatedAt: 100,
    })

    const recurringClaim = repository.claimDue(1_000, 10, "lock-r", 60_000, 1_000)
    const oneshotClaim = repository.claimDue(2_000, 10, "lock-o", 60_000, 2_000)

    repository.insertRun({
      id: "run-r",
      jobId: "job-recurring",
      scheduledFor: 1_000,
      startedAt: 1_001,
      finishedAt: null,
      status: "skipped",
      errorCode: null,
      errorMessage: null,
      resultJson: null,
      createdAt: 1_001,
    })
    repository.markRunFinished("run-r", "success", 1_010, null, null, '{"ok":true}')
    repository.rescheduleRecurring("job-recurring", "lock-r", 1_010, 2_810_000, 1_011)

    repository.insertRun({
      id: "run-o",
      jobId: "job-oneshot",
      scheduledFor: 2_000,
      startedAt: 2_001,
      finishedAt: null,
      status: "skipped",
      errorCode: null,
      errorMessage: null,
      resultJson: null,
      createdAt: 2_001,
    })
    repository.markRunFinished("run-o", "failed", 2_010, "timeout", "execution timeout", null)
    repository.finalizeOneShot("job-oneshot", "lock-o", "completed", null, 2_010, 2_011)

    // Assert
    expect(recurringClaim).toHaveLength(1)
    expect(oneshotClaim).toHaveLength(1)

    const recurring = db
      .prepare(
        "SELECT status, last_run_at as lastRunAt, next_run_at as nextRunAt, lock_token as lockToken FROM jobs WHERE id = ?"
      )
      .get("job-recurring") as {
      status: string
      lastRunAt: number
      nextRunAt: number
      lockToken: string | null
    }
    expect(recurring).toEqual({
      status: "idle",
      lastRunAt: 1_010,
      nextRunAt: 2_810_000,
      lockToken: null,
    })

    const oneshot = db
      .prepare(
        "SELECT status, last_run_at as lastRunAt, next_run_at as nextRunAt, terminal_state as terminalState FROM jobs WHERE id = ?"
      )
      .get("job-oneshot") as {
      status: string
      lastRunAt: number
      nextRunAt: number | null
      terminalState: string | null
    }
    expect(oneshot).toEqual({
      status: "idle",
      lastRunAt: 2_010,
      nextRunAt: null,
      terminalState: "completed",
    })

    const recurringRuns = repository.listRunsByJobId("job-recurring")
    const oneshotRuns = repository.listRunsByJobId("job-oneshot")
    const recentFailed = repository.listRecentFailedRuns(0, 10)
    expect(recurringRuns[0]?.status).toBe("success")
    expect(oneshotRuns[0]?.status).toBe("failed")
    expect(recentFailed[0]?.runId).toBe("run-o")
    expect(recentFailed[0]?.jobType).toBe("reminder")

    db.close()
  })

  it("stores approvals, task observations, and user profile snapshots", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const db = openPersistenceDatabase({ dbPath: path.join(tempRoot, "state.db") })
    const approvalsRepository = createApprovalsRepository(db)
    const tasksRepository = createTaskObservationsRepository(db)
    const profileRepository = createUserProfileRepository(db)

    // Act
    approvalsRepository.insert({
      id: "approval-1",
      actionType: "task.create",
      payload: "{}",
      reason: "Need confirmation",
      status: "pending",
      requestedAt: 100,
      expiresAt: null,
      resolvedAt: null,
      resolutionSource: null,
      createdAt: 100,
      updatedAt: 100,
    })
    tasksRepository.upsert({
      provider: "google_tasks",
      externalId: "task-1",
      title: "Call Alex",
      status: "open",
      dueAt: 500,
      observedAt: 200,
      metadata: "{}",
    })
    profileRepository.upsert({
      timezone: "Europe/Vienna",
      quietHoursStart: "20:00",
      quietHoursEnd: "08:00",
      heartbeatMorning: "08:00",
      heartbeatMidday: "13:00",
      heartbeatEvening: "19:00",
      updatedAt: 300,
    })

    // Assert
    expect(approvalsRepository.listPending()).toHaveLength(1)
    const task = db
      .prepare(
        "SELECT provider, external_id as externalId, title, status FROM task_observations WHERE provider = ? AND external_id = ?"
      )
      .get("google_tasks", "task-1") as {
      provider: string
      externalId: string
      title: string
      status: string
    }
    expect(task).toEqual({
      provider: "google_tasks",
      externalId: "task-1",
      title: "Call Alex",
      status: "open",
    })
    expect(profileRepository.get()).toEqual({
      timezone: "Europe/Vienna",
      quietHoursStart: "20:00",
      quietHoursEnd: "08:00",
      heartbeatMorning: "08:00",
      heartbeatMidday: "13:00",
      heartbeatEvening: "19:00",
      updatedAt: 300,
    })

    db.close()
  })

  it("stores task and command audit history", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const db = openPersistenceDatabase({ dbPath: path.join(tempRoot, "state.db") })
    const jobsRepository = createJobsRepository(db)
    const taskAuditRepository = createTaskAuditRepository(db)
    const commandAuditRepository = createCommandAuditRepository(db)

    jobsRepository.createTask({
      id: "job-audit-1",
      type: "reminder",
      status: "idle",
      scheduleType: "oneshot",
      profileId: null,
      runAt: 1_000,
      cadenceMinutes: null,
      payload: null,
      lastRunAt: null,
      nextRunAt: 1_000,
      terminalState: null,
      terminalReason: null,
      lockToken: null,
      lockExpiresAt: null,
      createdAt: 100,
      updatedAt: 100,
    })

    // Act
    taskAuditRepository.insert({
      id: "task-audit-1",
      taskId: "job-audit-1",
      action: "update",
      lane: "interactive",
      actor: "internal_tool",
      beforeJson: "{}",
      afterJson: "{}",
      metadataJson: "{}",
      createdAt: 500,
    })
    commandAuditRepository.insert({
      id: "cmd-audit-1",
      command: "update_task",
      lane: "interactive",
      status: "success",
      errorMessage: null,
      metadataJson: "{}",
      createdAt: 600,
    })

    // Assert
    const taskAudit = taskAuditRepository.listRecent()
    const commandAudit = commandAuditRepository.listRecent()
    expect(taskAudit[0]?.id).toBe("task-audit-1")
    expect(commandAudit[0]?.id).toBe("cmd-audit-1")

    db.close()
  })
})
