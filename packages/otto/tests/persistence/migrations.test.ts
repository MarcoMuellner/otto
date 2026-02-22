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
        "jobs",
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
})
