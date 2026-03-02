import { randomUUID } from "node:crypto"
import { DatabaseSync } from "node:sqlite"

export type SessionBindingRow = {
  bindingKey: string
  sessionId: string
  updatedAt: number
}

export type InteractiveContextEventRow = {
  sourceLane: string
  sourceKind: string
  sourceRef: string | null
  content: string
  deliveryStatus: "queued" | "sent" | "failed" | "held"
  deliveryStatusDetail: string | null
  errorMessage: string | null
  createdAt: number
}

type InsertCommandAuditInput = {
  command: string
  status: "success" | "failed" | "denied"
  lane: "interactive" | "scheduled" | null
  errorMessage: string | null
  metadata: Record<string, unknown>
  createdAt?: number
}

const openReadOnly = (databasePath: string): DatabaseSync => {
  return new DatabaseSync(databasePath, { readOnly: true })
}

const openReadWrite = (databasePath: string): DatabaseSync => {
  return new DatabaseSync(databasePath)
}

/**
 * Lists persisted OpenCode session bindings from Otto state so control-plane chat can use
 * runtime-owned session identity as the canonical thread source.
 */
export const listSessionBindings = (databasePath: string): SessionBindingRow[] => {
  let database: DatabaseSync | null = null

  try {
    database = openReadOnly(databasePath)
    const statement = database.prepare(
      `SELECT
        binding_key as bindingKey,
        session_id as sessionId,
        updated_at as updatedAt
       FROM session_bindings
       ORDER BY updated_at DESC`
    )

    return statement.all() as SessionBindingRow[]
  } finally {
    database?.close()
  }
}

/**
 * Lists recent non-interactive context events for one OpenCode session so interactive
 * prompts can include compact, session-scoped supporting context.
 */
export const listRecentInteractiveContextEventsBySourceSessionId = (
  databasePath: string,
  sourceSessionId: string,
  limit = 20
): InteractiveContextEventRow[] => {
  let database: DatabaseSync | null = null

  try {
    database = openReadOnly(databasePath)
    const statement = database.prepare(
      `SELECT
        source_lane as sourceLane,
        source_kind as sourceKind,
        source_ref as sourceRef,
        content,
        delivery_status as deliveryStatus,
        delivery_status_detail as deliveryStatusDetail,
        error_message as errorMessage,
        created_at as createdAt
       FROM interactive_context_events
       WHERE source_session_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT ?`
    )

    const normalizedLimit = Number.isInteger(limit) ? Math.max(1, limit) : 20
    return statement.all(sourceSessionId, normalizedLimit) as InteractiveContextEventRow[]
  } finally {
    database?.close()
  }
}

/**
 * Writes chat operation audit records to Otto command audit storage without coupling UI routes
 * to runtime repository internals.
 */
export const insertCommandAudit = (
  databasePath: string,
  input: InsertCommandAuditInput
): boolean => {
  let database: DatabaseSync | null = null

  try {
    database = openReadWrite(databasePath)
    const statement = database.prepare(
      `INSERT INTO command_audit_log
        (id, command, lane, status, error_message, metadata_json, created_at)
       VALUES
        (?, ?, ?, ?, ?, ?, ?)`
    )

    statement.run(
      randomUUID(),
      input.command,
      input.lane,
      input.status,
      input.errorMessage,
      JSON.stringify(input.metadata),
      input.createdAt ?? Date.now()
    )

    return true
  } catch {
    return false
  } finally {
    database?.close()
  }
}
