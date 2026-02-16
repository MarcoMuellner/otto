import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import {
  createApprovalsRepository,
  createJobsRepository,
  createOutboundMessagesRepository,
  createSessionBindingsRepository,
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
    repository.markSent("out-1", 600)

    // Assert
    expect(due).toHaveLength(1)
    expect(due[0]?.id).toBe("out-1")
    const updated = db
      .prepare("SELECT status, sent_at as sentAt FROM messages_out WHERE id = ?")
      .get("out-1") as { status: string; sentAt: number }
    expect(updated).toEqual({ status: "sent", sentAt: 600 })

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
      payload: null,
      lastRunAt: null,
      nextRunAt: 1000,
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
})
