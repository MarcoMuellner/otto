import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"

import { afterEach, describe, expect, it } from "vitest"

import {
  insertCommandAudit,
  listRecentInteractiveContextEventsBySourceSessionId,
  listSessionBindings,
} from "../../app/server/otto-state.server.js"

const cleanupPaths: string[] = []

afterEach(async () => {
  await Promise.all(
    cleanupPaths.splice(0).map(async (directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe("otto-state server helpers", () => {
  it("returns persisted session bindings", async () => {
    // Arrange
    const tempDirectory = await mkdtemp(path.join(tmpdir(), "otto-state-test-"))
    cleanupPaths.push(tempDirectory)
    const databasePath = path.join(tempDirectory, "otto-state.db")
    const database = new DatabaseSync(databasePath)

    database.exec(
      `CREATE TABLE session_bindings (
        binding_key TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )`
    )
    database
      .prepare(
        `INSERT INTO session_bindings (binding_key, session_id, updated_at)
       VALUES (?, ?, ?)`
      )
      .run("telegram:chat:123:assistant", "session-1", 10)
    database.close()

    // Act
    const rows = listSessionBindings(databasePath)

    // Assert
    expect(rows).toEqual([
      {
        bindingKey: "telegram:chat:123:assistant",
        sessionId: "session-1",
        updatedAt: 10,
      },
    ])
  })

  it("writes command audit entries when table exists", async () => {
    // Arrange
    const tempDirectory = await mkdtemp(path.join(tmpdir(), "otto-state-test-"))
    cleanupPaths.push(tempDirectory)
    const databasePath = path.join(tempDirectory, "otto-state.db")
    const database = new DatabaseSync(databasePath)

    database.exec(
      `CREATE TABLE command_audit_log (
        id TEXT PRIMARY KEY,
        command TEXT NOT NULL,
        lane TEXT,
        status TEXT NOT NULL,
        error_message TEXT,
        metadata_json TEXT,
        created_at INTEGER NOT NULL
      )`
    )
    database.close()

    // Act
    const inserted = insertCommandAudit(databasePath, {
      command: "chat.list_threads",
      lane: "interactive",
      status: "success",
      errorMessage: null,
      metadata: { test: true },
      createdAt: 123,
    })

    const verifyDatabase = new DatabaseSync(databasePath, { readOnly: true })
    const row = verifyDatabase
      .prepare(
        `SELECT command, lane, status, error_message as errorMessage, metadata_json as metadataJson, created_at as createdAt
         FROM command_audit_log
         LIMIT 1`
      )
      .get() as
      | {
          command: string
          lane: string
          status: string
          errorMessage: string | null
          metadataJson: string
          createdAt: number
        }
      | undefined
    verifyDatabase.close()

    // Assert
    expect(inserted).toBe(true)
    expect(row).toMatchObject({
      command: "chat.list_threads",
      lane: "interactive",
      status: "success",
      errorMessage: null,
      createdAt: 123,
    })
  })

  it("lists recent interactive context events mapped for web prompt injection", async () => {
    // Arrange
    const tempDirectory = await mkdtemp(path.join(tmpdir(), "otto-state-test-"))
    cleanupPaths.push(tempDirectory)
    const databasePath = path.join(tempDirectory, "otto-state.db")
    const database = new DatabaseSync(databasePath)

    database.exec(
      `CREATE TABLE interactive_context_events (
        id TEXT PRIMARY KEY,
        source_session_id TEXT NOT NULL,
        outbound_message_id TEXT NOT NULL,
        source_lane TEXT NOT NULL,
        source_kind TEXT NOT NULL,
        source_ref TEXT,
        content TEXT NOT NULL,
        delivery_status TEXT NOT NULL,
        delivery_status_detail TEXT,
        error_message TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`
    )

    database
      .prepare(
        `INSERT INTO interactive_context_events
          (id, source_session_id, outbound_message_id, source_lane, source_kind, source_ref, content, delivery_status, delivery_status_detail, error_message, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        "event-1",
        "session-1",
        "out-1",
        "scheduler",
        "heartbeat",
        "job-1",
        "Digest delivered",
        "sent",
        "delivered",
        null,
        100,
        100
      )
    database
      .prepare(
        `INSERT INTO interactive_context_events
          (id, source_session_id, outbound_message_id, source_lane, source_kind, source_ref, content, delivery_status, delivery_status_detail, error_message, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        "event-2",
        "session-1",
        "out-2",
        "scheduler",
        "watchdog",
        null,
        "Watchdog failed",
        "failed",
        null,
        "max_attempts_exhausted",
        200,
        200
      )
    database.close()

    // Act
    const rows = listRecentInteractiveContextEventsBySourceSessionId(databasePath, "session-1")

    // Assert
    expect(rows).toEqual([
      {
        sourceLane: "scheduler",
        sourceKind: "watchdog",
        sourceRef: null,
        content: "Watchdog failed",
        deliveryStatus: "failed",
        deliveryStatusDetail: null,
        errorMessage: "max_attempts_exhausted",
        createdAt: 200,
      },
      {
        sourceLane: "scheduler",
        sourceKind: "heartbeat",
        sourceRef: "job-1",
        content: "Digest delivered",
        deliveryStatus: "sent",
        deliveryStatusDetail: "delivered",
        errorMessage: null,
        createdAt: 100,
      },
    ])
  })

  it("orders recent interactive context events by created_at and id with limit", async () => {
    // Arrange
    const tempDirectory = await mkdtemp(path.join(tmpdir(), "otto-state-test-"))
    cleanupPaths.push(tempDirectory)
    const databasePath = path.join(tempDirectory, "otto-state.db")
    const database = new DatabaseSync(databasePath)

    database.exec(
      `CREATE TABLE interactive_context_events (
        id TEXT PRIMARY KEY,
        source_session_id TEXT NOT NULL,
        outbound_message_id TEXT NOT NULL,
        source_lane TEXT NOT NULL,
        source_kind TEXT NOT NULL,
        source_ref TEXT,
        content TEXT NOT NULL,
        delivery_status TEXT NOT NULL,
        delivery_status_detail TEXT,
        error_message TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`
    )

    const insert = database.prepare(
      `INSERT INTO interactive_context_events
        (id, source_session_id, outbound_message_id, source_lane, source_kind, source_ref, content, delivery_status, delivery_status_detail, error_message, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )

    insert.run(
      "event-a",
      "session-2",
      "out-a",
      "scheduler",
      "job",
      null,
      "A",
      "queued",
      null,
      null,
      10,
      10
    )
    insert.run(
      "event-c",
      "session-2",
      "out-c",
      "scheduler",
      "job",
      null,
      "C",
      "queued",
      null,
      null,
      20,
      20
    )
    insert.run(
      "event-b",
      "session-2",
      "out-b",
      "scheduler",
      "job",
      null,
      "B",
      "queued",
      null,
      null,
      20,
      20
    )
    database.close()

    // Act
    const rows = listRecentInteractiveContextEventsBySourceSessionId(databasePath, "session-2", 2)

    // Assert
    expect(rows.map((entry) => entry.content)).toEqual(["C", "B"])
  })
})
