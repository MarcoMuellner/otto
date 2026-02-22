import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"

import { afterEach, describe, expect, it } from "vitest"

import { insertCommandAudit, listSessionBindings } from "../../app/server/otto-state.server.js"

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
})
