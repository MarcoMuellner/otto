import type { DatabaseSync } from "node:sqlite"

export type MessagePriority = "low" | "normal" | "high"
export type OutboundMessageStatus = "queued" | "sent" | "failed" | "cancelled"
export type JobStatus = "idle" | "running" | "paused"
export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired"

export type SessionBindingRecord = {
  bindingKey: string
  sessionId: string
  updatedAt: number
}

export type InboundMessageRecord = {
  id: string
  sourceMessageId: string
  chatId: number
  userId: number | null
  content: string | null
  receivedAt: number
  sessionId: string | null
  createdAt: number
}

export type OutboundMessageRecord = {
  id: string
  dedupeKey: string | null
  chatId: number
  content: string
  priority: MessagePriority
  status: OutboundMessageStatus
  attemptCount: number
  nextAttemptAt: number | null
  sentAt: number | null
  failedAt: number | null
  errorMessage: string | null
  createdAt: number
  updatedAt: number
}

export type JobRecord = {
  id: string
  type: string
  status: JobStatus
  payload: string | null
  lastRunAt: number | null
  nextRunAt: number | null
  lockToken: string | null
  lockExpiresAt: number | null
  createdAt: number
  updatedAt: number
}

export type ApprovalRecord = {
  id: string
  actionType: string
  payload: string
  reason: string | null
  status: ApprovalStatus
  requestedAt: number
  expiresAt: number | null
  resolvedAt: number | null
  resolutionSource: string | null
  createdAt: number
  updatedAt: number
}

export type TaskObservationRecord = {
  provider: string
  externalId: string
  title: string | null
  status: string
  dueAt: number | null
  observedAt: number
  metadata: string | null
}

export type UserProfileRecord = {
  timezone: string | null
  quietHoursStart: string | null
  quietHoursEnd: string | null
  heartbeatMorning: string | null
  heartbeatMidday: string | null
  heartbeatEvening: string | null
  updatedAt: number
}

const isUniqueConstraintForColumn = (error: unknown, columnName: string): boolean => {
  if (!(error instanceof Error)) {
    return false
  }

  const message = error.message.toLowerCase()
  return message.includes("unique") && message.includes(columnName.toLowerCase())
}

/**
 * Keeps session binding persistence isolated so future transport adapters can share the same
 * OpenCode session mapping contract.
 *
 * @param database Open SQLite database instance.
 * @returns Repository for session binding read/write operations.
 */
export const createSessionBindingsRepository = (database: DatabaseSync) => {
  const getStatement = database.prepare(
    `SELECT
      binding_key as bindingKey,
      session_id as sessionId,
      updated_at as updatedAt
     FROM session_bindings
     WHERE binding_key = ?`
  )

  const setStatement = database.prepare(
    `INSERT INTO session_bindings (binding_key, session_id, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(binding_key) DO UPDATE SET
       session_id = excluded.session_id,
       updated_at = excluded.updated_at`
  )

  const getTelegramBindingBySessionIdStatement = database.prepare(
    `SELECT
      binding_key as bindingKey
     FROM session_bindings
     WHERE session_id = ?
       AND binding_key LIKE 'telegram:chat:%:assistant'
     ORDER BY updated_at DESC
     LIMIT 1`
  )

  const parseTelegramChatIdFromBindingKey = (bindingKey: string): number | null => {
    const match = /^telegram:chat:(-?\d+):assistant$/.exec(bindingKey)
    if (!match) {
      return null
    }

    const parsed = Number(match[1])
    return Number.isInteger(parsed) ? parsed : null
  }

  return {
    getByBindingKey: (bindingKey: string): SessionBindingRecord | null => {
      const row = getStatement.get(bindingKey) as SessionBindingRecord | undefined
      return row ?? null
    },
    upsert: (bindingKey: string, sessionId: string, updatedAt = Date.now()): void => {
      setStatement.run(bindingKey, sessionId, updatedAt)
    },
    getTelegramChatIdBySessionId: (sessionId: string): number | null => {
      const row = getTelegramBindingBySessionIdStatement.get(sessionId) as
        | { bindingKey: string }
        | undefined

      if (!row) {
        return null
      }

      return parseTelegramChatIdFromBindingKey(row.bindingKey)
    },
  }
}

/**
 * Captures inbound Telegram traffic durably so replay safety and message-level audit trails
 * remain available to later workflow steps.
 *
 * @param database Open SQLite database instance.
 * @returns Repository for inbound message records.
 */
export const createInboundMessagesRepository = (database: DatabaseSync) => {
  const insertStatement = database.prepare(
    `INSERT INTO messages_in
      (id, source_message_id, chat_id, user_id, content, received_at, session_id, created_at)
     VALUES
      (@id, @sourceMessageId, @chatId, @userId, @content, @receivedAt, @sessionId, @createdAt)`
  )

  return {
    insert: (record: InboundMessageRecord): void => {
      insertStatement.run(record)
    },
  }
}

/**
 * Stores outbound queue state in a dedicated repository so delivery retry policy can evolve
 * without coupling message persistence to transport code.
 *
 * @param database Open SQLite database instance.
 * @returns Repository for outbound queue lifecycle operations.
 */
export const createOutboundMessagesRepository = (database: DatabaseSync) => {
  const insertStatement = database.prepare(
    `INSERT INTO messages_out
      (id, dedupe_key, chat_id, content, priority, status, attempt_count, next_attempt_at, sent_at, failed_at, error_message, created_at, updated_at)
     VALUES
      (@id, @dedupeKey, @chatId, @content, @priority, @status, @attemptCount, @nextAttemptAt, @sentAt, @failedAt, @errorMessage, @createdAt, @updatedAt)`
  )

  const updateQueuedRetryStatement = database.prepare(
    `UPDATE messages_out
     SET status = 'queued',
         attempt_count = ?,
         next_attempt_at = ?,
         error_message = ?,
         updated_at = ?
     WHERE id = ?`
  )

  const markFailedStatement = database.prepare(
    `UPDATE messages_out
     SET status = 'failed',
         attempt_count = ?,
         next_attempt_at = NULL,
         failed_at = ?,
         error_message = ?,
         updated_at = ?
     WHERE id = ?`
  )

  const listDueStatement = database.prepare(
    `SELECT
      id,
      dedupe_key as dedupeKey,
      chat_id as chatId,
      content,
      priority,
      status,
      attempt_count as attemptCount,
      next_attempt_at as nextAttemptAt,
      sent_at as sentAt,
      failed_at as failedAt,
      error_message as errorMessage,
      created_at as createdAt,
      updated_at as updatedAt
     FROM messages_out
     WHERE status = 'queued'
       AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
     ORDER BY created_at ASC`
  )

  const markSentStatement = database.prepare(
    `UPDATE messages_out
     SET status = 'sent',
         attempt_count = ?,
         next_attempt_at = NULL,
         sent_at = ?,
         failed_at = NULL,
         error_message = NULL,
         updated_at = ?
     WHERE id = ?`
  )

  return {
    enqueueOrIgnoreDedupe: (record: OutboundMessageRecord): "enqueued" | "duplicate" => {
      try {
        insertStatement.run(record)
        return "enqueued"
      } catch (error) {
        if (record.dedupeKey && isUniqueConstraintForColumn(error, "dedupe_key")) {
          return "duplicate"
        }

        throw error
      }
    },
    enqueue: (record: OutboundMessageRecord): void => {
      insertStatement.run(record)
    },
    listDue: (timestamp = Date.now()): OutboundMessageRecord[] => {
      return listDueStatement.all(timestamp) as OutboundMessageRecord[]
    },
    markSent: (id: string, attemptCount: number, timestamp = Date.now()): void => {
      markSentStatement.run(attemptCount, timestamp, timestamp, id)
    },
    markRetry: (
      id: string,
      attemptCount: number,
      nextAttemptAt: number,
      errorMessage: string,
      timestamp = Date.now()
    ): void => {
      updateQueuedRetryStatement.run(attemptCount, nextAttemptAt, errorMessage, timestamp, id)
    },
    markFailed: (
      id: string,
      attemptCount: number,
      errorMessage: string,
      timestamp = Date.now()
    ): void => {
      markFailedStatement.run(attemptCount, timestamp, errorMessage, timestamp, id)
    },
  }
}

/**
 * Persists scheduler job state so periodic execution remains restart-safe and idempotent.
 *
 * @param database Open SQLite database instance.
 * @returns Repository for scheduler job records.
 */
export const createJobsRepository = (database: DatabaseSync) => {
  const upsertStatement = database.prepare(
    `INSERT INTO jobs
      (id, type, status, payload, last_run_at, next_run_at, lock_token, lock_expires_at, created_at, updated_at)
     VALUES
      (@id, @type, @status, @payload, @lastRunAt, @nextRunAt, @lockToken, @lockExpiresAt, @createdAt, @updatedAt)
     ON CONFLICT(id) DO UPDATE SET
      type = excluded.type,
      status = excluded.status,
      payload = excluded.payload,
      last_run_at = excluded.last_run_at,
      next_run_at = excluded.next_run_at,
      lock_token = excluded.lock_token,
      lock_expires_at = excluded.lock_expires_at,
      updated_at = excluded.updated_at`
  )

  const listDueStatement = database.prepare(
    `SELECT
      id,
      type,
      status,
      payload,
      last_run_at as lastRunAt,
      next_run_at as nextRunAt,
      lock_token as lockToken,
      lock_expires_at as lockExpiresAt,
      created_at as createdAt,
      updated_at as updatedAt
     FROM jobs
     WHERE next_run_at IS NOT NULL
       AND next_run_at <= ?
     ORDER BY next_run_at ASC`
  )

  return {
    upsert: (record: JobRecord): void => {
      upsertStatement.run(record)
    },
    listDue: (timestamp = Date.now()): JobRecord[] => {
      return listDueStatement.all(timestamp) as JobRecord[]
    },
  }
}

/**
 * Stores approval state transitions durably so write authorization decisions are traceable
 * and safe to recover after restarts.
 *
 * @param database Open SQLite database instance.
 * @returns Repository for approval workflow persistence.
 */
export const createApprovalsRepository = (database: DatabaseSync) => {
  const insertStatement = database.prepare(
    `INSERT INTO approvals
      (id, action_type, payload, reason, status, requested_at, expires_at, resolved_at, resolution_source, created_at, updated_at)
     VALUES
      (@id, @actionType, @payload, @reason, @status, @requestedAt, @expiresAt, @resolvedAt, @resolutionSource, @createdAt, @updatedAt)`
  )

  const listPendingStatement = database.prepare(
    `SELECT
      id,
      action_type as actionType,
      payload,
      reason,
      status,
      requested_at as requestedAt,
      expires_at as expiresAt,
      resolved_at as resolvedAt,
      resolution_source as resolutionSource,
      created_at as createdAt,
      updated_at as updatedAt
     FROM approvals
     WHERE status = 'pending'
     ORDER BY requested_at ASC`
  )

  return {
    insert: (record: ApprovalRecord): void => {
      insertStatement.run(record)
    },
    listPending: (): ApprovalRecord[] => {
      return listPendingStatement.all() as ApprovalRecord[]
    },
  }
}

/**
 * Tracks external task observations independently from messaging so completion reconciliation
 * can run without mutating conversational state.
 *
 * @param database Open SQLite database instance.
 * @returns Repository for external task observations.
 */
export const createTaskObservationsRepository = (database: DatabaseSync) => {
  const upsertStatement = database.prepare(
    `INSERT INTO task_observations
      (provider, external_id, title, status, due_at, observed_at, metadata)
     VALUES
      (@provider, @externalId, @title, @status, @dueAt, @observedAt, @metadata)
     ON CONFLICT(provider, external_id) DO UPDATE SET
      title = excluded.title,
      status = excluded.status,
      due_at = excluded.due_at,
      observed_at = excluded.observed_at,
      metadata = excluded.metadata`
  )

  return {
    upsert: (record: TaskObservationRecord): void => {
      upsertStatement.run(record)
    },
  }
}

/**
 * Maintains a single user profile record so scheduling and quiet-hour policies can be read
 * consistently by every worker module.
 *
 * @param database Open SQLite database instance.
 * @returns Repository for user profile persistence.
 */
export const createUserProfileRepository = (database: DatabaseSync) => {
  const getStatement = database.prepare(
    `SELECT
      timezone,
      quiet_hours_start as quietHoursStart,
      quiet_hours_end as quietHoursEnd,
      heartbeat_morning as heartbeatMorning,
      heartbeat_midday as heartbeatMidday,
      heartbeat_evening as heartbeatEvening,
      updated_at as updatedAt
     FROM user_profile
     WHERE id = 1`
  )

  const upsertStatement = database.prepare(
    `INSERT INTO user_profile
      (id, timezone, quiet_hours_start, quiet_hours_end, heartbeat_morning, heartbeat_midday, heartbeat_evening, updated_at)
     VALUES
      (1, @timezone, @quietHoursStart, @quietHoursEnd, @heartbeatMorning, @heartbeatMidday, @heartbeatEvening, @updatedAt)
     ON CONFLICT(id) DO UPDATE SET
      timezone = excluded.timezone,
      quiet_hours_start = excluded.quiet_hours_start,
      quiet_hours_end = excluded.quiet_hours_end,
      heartbeat_morning = excluded.heartbeat_morning,
      heartbeat_midday = excluded.heartbeat_midday,
      heartbeat_evening = excluded.heartbeat_evening,
      updated_at = excluded.updated_at`
  )

  return {
    get: (): UserProfileRecord | null => {
      const row = getStatement.get() as UserProfileRecord | undefined
      return row ?? null
    },
    upsert: (record: UserProfileRecord): void => {
      upsertStatement.run(record)
    },
  }
}
