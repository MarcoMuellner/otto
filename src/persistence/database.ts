import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import Database from "better-sqlite3"

import { SQL_MIGRATIONS } from "./migrations.js"

export type PersistenceDatabaseOptions = {
  dbPath?: string
  ottoHome?: string
}

/**
 * Resolves a durable state location under Otto home so orchestration state persists across
 * restarts and release updates without coupling to the current working directory.
 *
 * @param options Optional overrides for custom embedding and tests.
 * @returns Absolute path for the persistence SQLite file.
 */
export const resolvePersistenceDatabasePath = (
  options: PersistenceDatabaseOptions = {}
): string => {
  if (options.dbPath) {
    return path.resolve(options.dbPath)
  }

  const ottoHome = options.ottoHome ?? process.env.OTTO_HOME ?? path.join(os.homedir(), ".otto")
  return path.join(ottoHome, "data", "otto-state.db")
}

/**
 * Opens the SQLite database and applies schema migrations so higher-level repositories can
 * rely on consistent storage contracts immediately.
 *
 * @param options Optional path overrides for runtime and tests.
 * @returns Open SQLite database instance with migrations applied.
 */
export const openPersistenceDatabase = (
  options: PersistenceDatabaseOptions = {}
): Database.Database => {
  const dbPath = resolvePersistenceDatabasePath(options)
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })

  const database = new Database(dbPath)
  database.pragma("journal_mode = WAL")

  applyMigrations(database)

  return database
}

/**
 * Applies pending migrations exactly once so schema upgrades remain idempotent and safe.
 *
 * @param database Open SQLite database instance.
 */
export const applyMigrations = (database: Database.Database): void => {
  const bootstrapMigrationTable = database.transaction(() => {
    database.exec(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at INTEGER NOT NULL
      )`
    )
  })

  bootstrapMigrationTable()

  const hasMigration = database.prepare("SELECT 1 FROM schema_migrations WHERE id = ?")
  const insertMigration = database.prepare(
    "INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)"
  )

  for (const migration of SQL_MIGRATIONS) {
    const existing = hasMigration.get(migration.id) as { 1: number } | undefined
    if (existing) {
      continue
    }

    const runMigration = database.transaction(() => {
      for (const statement of migration.statements) {
        database.exec(statement)
      }

      insertMigration.run(migration.id, Date.now())
    })

    runMigration()
  }
}
