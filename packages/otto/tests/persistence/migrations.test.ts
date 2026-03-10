import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import {
  SQL_MIGRATIONS,
  applyMigrations,
  openPersistenceDatabase,
  resolvePersistenceDatabasePath,
} from "../../src/persistence/index.js"

const TEMP_PREFIX = path.join(tmpdir(), "otto-persistence-")
const cleanupPaths: string[] = []

afterEach(async () => {
  await Promise.all(
    cleanupPaths.splice(0).map(async (directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe("resolvePersistenceDatabasePath", () => {
  it("resolves path under otto home data directory", () => {
    // Arrange
    const ottoHome = "/tmp/otto-home"

    // Act
    const dbPath = resolvePersistenceDatabasePath({ ottoHome })

    // Assert
    expect(dbPath).toBe("/tmp/otto-home/data/otto-state.db")
  })
})

describe("openPersistenceDatabase", () => {
  it("creates migration-managed schema tables", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const dbPath = path.join(tempRoot, "state.db")

    // Act
    const db = openPersistenceDatabase({ dbPath })
    const tables = db
      .prepare(
        `SELECT name
         FROM sqlite_master
         WHERE type = 'table'
         ORDER BY name ASC`
      )
      .all() as Array<{ name: string }>
    db.close()

    // Assert
    const tableNames = tables.map((entry) => entry.name)
    expect(tableNames).toEqual(
      expect.arrayContaining([
        "approvals",
        "eod_learning_actions",
        "eod_learning_evidence",
        "eod_learning_items",
        "eod_learning_runs",
        "interactive_context_events",
        "jobs",
        "job_run_sessions",
        "messages_in",
        "messages_in_voice",
        "messages_out",
        "schema_migrations",
        "session_bindings",
        "task_observations",
        "user_profile",
      ])
    )
  })

  it("applies migrations idempotently", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const dbPath = path.join(tempRoot, "state.db")
    const db = openPersistenceDatabase({ dbPath })

    // Act
    applyMigrations(db)
    applyMigrations(db)
    const countRow = db.prepare("SELECT COUNT(*) as count FROM schema_migrations").get() as {
      count: number
    }
    db.close()

    // Assert
    expect(countRow.count).toBe(SQL_MIGRATIONS.length)
  })

  it("adds model_ref column on jobs table", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const dbPath = path.join(tempRoot, "state.db")

    // Act
    const db = openPersistenceDatabase({ dbPath })
    const columns = db.prepare("PRAGMA table_info(jobs)").all() as Array<{ name: string }>
    db.close()

    // Assert
    expect(columns.map((column) => column.name)).toContain("model_ref")
  })

  it("adds prompt provenance columns for job runs and run sessions", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const dbPath = path.join(tempRoot, "state.db")

    // Act
    const db = openPersistenceDatabase({ dbPath })
    const runColumns = db.prepare("PRAGMA table_info(job_runs)").all() as Array<{ name: string }>
    const runSessionColumns = db.prepare("PRAGMA table_info(job_run_sessions)").all() as Array<{
      name: string
    }>
    db.close()

    // Assert
    expect(runColumns.map((column) => column.name)).toContain("prompt_provenance_json")
    expect(runSessionColumns.map((column) => column.name)).toContain("prompt_provenance_json")
  })

  it("adds interactive context events table with delivery and lookup indexes", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const dbPath = path.join(tempRoot, "state.db")

    // Act
    const db = openPersistenceDatabase({ dbPath })
    const columns = db.prepare("PRAGMA table_info(interactive_context_events)").all() as Array<{
      name: string
    }>
    const indexes = db.prepare("PRAGMA index_list(interactive_context_events)").all() as Array<{
      name: string
    }>
    db.close()

    // Assert
    expect(columns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        "source_session_id",
        "outbound_message_id",
        "delivery_status",
        "delivery_status_detail",
      ])
    )
    expect(indexes.map((index) => index.name)).toEqual(
      expect.arrayContaining([
        "idx_interactive_context_events_outbound_message",
        "idx_interactive_context_events_session_recent",
      ])
    )
  })

  it("adds EOD learning tables with recent and window lookup indexes", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const dbPath = path.join(tempRoot, "state.db")

    // Act
    const db = openPersistenceDatabase({ dbPath })
    const runColumns = db.prepare("PRAGMA table_info(eod_learning_runs)").all() as Array<{
      name: string
    }>
    const itemColumns = db.prepare("PRAGMA table_info(eod_learning_items)").all() as Array<{
      name: string
    }>
    const itemIndexes = db.prepare("PRAGMA index_list(eod_learning_items)").all() as Array<{
      name: string
    }>
    const runIndexes = db.prepare("PRAGMA index_list(eod_learning_runs)").all() as Array<{
      name: string
    }>
    const evidenceIndexes = db.prepare("PRAGMA index_list(eod_learning_evidence)").all() as Array<{
      name: string
    }>
    db.close()

    // Assert
    expect(runColumns.map((column) => column.name)).toEqual(
      expect.arrayContaining(["window_started_at", "window_ended_at", "status"])
    )
    expect(itemColumns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        "decision",
        "confidence",
        "contradiction_flag",
        "expected_value",
        "apply_status",
      ])
    )
    expect(itemIndexes.map((index) => index.name)).toContain("idx_eod_learning_items_run_item")
    expect(runIndexes.map((index) => index.name)).toContain("idx_eod_learning_runs_recent")
    expect(evidenceIndexes.map((index) => index.name)).toContain("idx_eod_learning_evidence_window")
  })
})
