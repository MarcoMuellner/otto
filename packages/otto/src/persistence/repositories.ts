import type { DatabaseSync } from "node:sqlite"

export type MessagePriority = "low" | "normal" | "high" | "critical"
export type OutboundMessageStatus = "queued" | "sent" | "failed" | "cancelled"
export type JobStatus = "idle" | "running" | "paused"
export type JobScheduleType = "recurring" | "oneshot"
export type JobTerminalState = "completed" | "expired" | "cancelled"
export type JobRunStatus = "success" | "failed" | "skipped"
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

export type VoiceInboundStatus = "accepted" | "rejected" | "transcribed" | "failed"

export type VoiceInboundMessageRecord = {
  id: string
  sourceMessageId: string
  chatId: number
  userId: number | null
  telegramFileId: string
  telegramFileUniqueId: string | null
  durationSeconds: number
  mimeType: string | null
  fileSizeBytes: number | null
  downloadedSizeBytes: number | null
  status: VoiceInboundStatus
  rejectReason: string | null
  errorMessage: string | null
  transcript: string | null
  transcriptLanguage: string | null
  createdAt: number
  updatedAt: number
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
  scheduleType: JobScheduleType
  profileId: string | null
  runAt: number | null
  cadenceMinutes: number | null
  payload: string | null
  lastRunAt: number | null
  nextRunAt: number | null
  terminalState: JobTerminalState | null
  terminalReason: string | null
  lockToken: string | null
  lockExpiresAt: number | null
  createdAt: number
  updatedAt: number
}

export type JobRunRecord = {
  id: string
  jobId: string
  scheduledFor: number | null
  startedAt: number
  finishedAt: number | null
  status: JobRunStatus
  errorCode: string | null
  errorMessage: string | null
  resultJson: string | null
  createdAt: number
}

export type FailedJobRunRecord = {
  runId: string
  jobId: string
  jobType: string
  startedAt: number
  errorCode: string | null
  errorMessage: string | null
}

export type JobRunSummaryRecord = {
  runId: string
  jobId: string
  jobType: string
  startedAt: number
  finishedAt: number | null
  status: JobRunStatus
  errorCode: string | null
  errorMessage: string | null
  resultJson: string | null
}

export type TaskListRecord = {
  id: string
  type: string
  scheduleType: JobScheduleType
  profileId: string | null
  status: JobStatus
  runAt: number | null
  cadenceMinutes: number | null
  nextRunAt: number | null
  terminalState: JobTerminalState | null
  terminalReason: string | null
  updatedAt: number
}

export type TaskAuditRecord = {
  id: string
  taskId: string
  action: "create" | "update" | "delete"
  lane: "interactive" | "scheduled"
  actor: string | null
  beforeJson: string | null
  afterJson: string | null
  metadataJson: string | null
  createdAt: number
}

export type CommandAuditRecord = {
  id: string
  command: string
  lane: "interactive" | "scheduled" | null
  status: "success" | "failed" | "denied"
  errorMessage: string | null
  metadataJson: string | null
  createdAt: number
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
  quietMode: "critical_only" | "off" | null
  muteUntil: number | null
  heartbeatMorning: string | null
  heartbeatMidday: string | null
  heartbeatEvening: string | null
  heartbeatCadenceMinutes: number | null
  heartbeatOnlyIfSignal: boolean
  onboardingCompletedAt: number | null
  lastDigestAt: number | null
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
 * Persists voice intake records independently from text prompts so media metadata,
 * transcription outcomes, and failure reasons stay auditable.
 *
 * @param database Open SQLite database instance.
 * @returns Repository for voice inbound lifecycle writes.
 */
export const createVoiceInboundMessagesRepository = (database: DatabaseSync) => {
  const insertStatement = database.prepare(
    `INSERT INTO messages_in_voice
      (id, source_message_id, chat_id, user_id, telegram_file_id, telegram_file_unique_id, duration_seconds, mime_type, file_size_bytes, downloaded_size_bytes, status, reject_reason, error_message, transcript, transcript_language, created_at, updated_at)
     VALUES
      (@id, @sourceMessageId, @chatId, @userId, @telegramFileId, @telegramFileUniqueId, @durationSeconds, @mimeType, @fileSizeBytes, @downloadedSizeBytes, @status, @rejectReason, @errorMessage, @transcript, @transcriptLanguage, @createdAt, @updatedAt)`
  )

  const updateStatusStatement = database.prepare(
    `UPDATE messages_in_voice
     SET downloaded_size_bytes = COALESCE(@downloadedSizeBytes, downloaded_size_bytes),
         status = @status,
         reject_reason = @rejectReason,
         error_message = @errorMessage,
         transcript = @transcript,
         transcript_language = @transcriptLanguage,
         updated_at = @updatedAt
     WHERE source_message_id = @sourceMessageId`
  )

  return {
    insertOrIgnore: (record: VoiceInboundMessageRecord): "inserted" | "duplicate" => {
      try {
        insertStatement.run(record)
        return "inserted"
      } catch (error) {
        if (isUniqueConstraintForColumn(error, "source_message_id")) {
          return "duplicate"
        }

        throw error
      }
    },
    markRejected: (
      sourceMessageId: string,
      rejectReason: string,
      updatedAt = Date.now(),
      downloadedSizeBytes: number | null = null
    ): void => {
      updateStatusStatement.run({
        sourceMessageId,
        downloadedSizeBytes,
        status: "rejected",
        rejectReason,
        errorMessage: null,
        transcript: null,
        transcriptLanguage: null,
        updatedAt,
      })
    },
    markTranscribed: (
      sourceMessageId: string,
      transcript: string,
      transcriptLanguage: string | null,
      updatedAt = Date.now(),
      downloadedSizeBytes: number | null = null
    ): void => {
      updateStatusStatement.run({
        sourceMessageId,
        downloadedSizeBytes,
        status: "transcribed",
        rejectReason: null,
        errorMessage: null,
        transcript,
        transcriptLanguage,
        updatedAt,
      })
    },
    markFailed: (
      sourceMessageId: string,
      errorMessage: string,
      updatedAt = Date.now(),
      downloadedSizeBytes: number | null = null
    ): void => {
      updateStatusStatement.run({
        sourceMessageId,
        downloadedSizeBytes,
        status: "failed",
        rejectReason: null,
        errorMessage,
        transcript: null,
        transcriptLanguage: null,
        updatedAt,
      })
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
      (id, type, status, schedule_type, profile_id, run_at, cadence_minutes, payload, last_run_at, next_run_at, terminal_state, terminal_reason, lock_token, lock_expires_at, created_at, updated_at)
     VALUES
      (@id, @type, @status, @scheduleType, @profileId, @runAt, @cadenceMinutes, @payload, @lastRunAt, @nextRunAt, @terminalState, @terminalReason, @lockToken, @lockExpiresAt, @createdAt, @updatedAt)
     ON CONFLICT(id) DO UPDATE SET
       type = excluded.type,
       status = excluded.status,
       schedule_type = excluded.schedule_type,
       profile_id = excluded.profile_id,
       run_at = excluded.run_at,
       cadence_minutes = excluded.cadence_minutes,
       payload = excluded.payload,
       last_run_at = excluded.last_run_at,
       next_run_at = excluded.next_run_at,
       terminal_state = excluded.terminal_state,
       terminal_reason = excluded.terminal_reason,
       lock_token = excluded.lock_token,
       lock_expires_at = excluded.lock_expires_at,
       updated_at = excluded.updated_at`
  )

  const listDueStatement = database.prepare(
    `SELECT
      id,
      type,
      status,
      schedule_type as scheduleType,
      profile_id as profileId,
      run_at as runAt,
      cadence_minutes as cadenceMinutes,
      payload,
      last_run_at as lastRunAt,
      next_run_at as nextRunAt,
      terminal_state as terminalState,
      terminal_reason as terminalReason,
      lock_token as lockToken,
      lock_expires_at as lockExpiresAt,
      created_at as createdAt,
      updated_at as updatedAt
     FROM jobs
     WHERE next_run_at IS NOT NULL
       AND next_run_at <= ?
     ORDER BY next_run_at ASC`
  )

  const selectClaimableIdsStatement = database.prepare(
    `SELECT id
     FROM jobs
     WHERE status != 'paused'
       AND next_run_at IS NOT NULL
       AND next_run_at <= ?
       AND (
         lock_token IS NULL
         OR lock_expires_at IS NULL
         OR lock_expires_at <= ?
       )
     ORDER BY next_run_at ASC
     LIMIT ?`
  )

  const claimByIdStatement = database.prepare(
    `UPDATE jobs
     SET status = 'running',
         lock_token = ?,
         lock_expires_at = ?,
         updated_at = ?
     WHERE id = ?
       AND status != 'paused'
       AND (
         lock_token IS NULL
         OR lock_expires_at IS NULL
         OR lock_expires_at <= ?
       )`
  )

  const getByIdStatement = database.prepare(
    `SELECT
      id,
      type,
      status,
      schedule_type as scheduleType,
      profile_id as profileId,
      run_at as runAt,
      cadence_minutes as cadenceMinutes,
      payload,
      last_run_at as lastRunAt,
      next_run_at as nextRunAt,
      terminal_state as terminalState,
      terminal_reason as terminalReason,
      lock_token as lockToken,
      lock_expires_at as lockExpiresAt,
      created_at as createdAt,
      updated_at as updatedAt
     FROM jobs
     WHERE id = ?`
  )

  const releaseLockStatement = database.prepare(
    `UPDATE jobs
     SET status = 'idle',
         lock_token = NULL,
         lock_expires_at = NULL,
         updated_at = ?
     WHERE id = ?
       AND lock_token = ?`
  )

  const setProfileStatement = database.prepare(
    `UPDATE jobs
     SET profile_id = ?,
         updated_at = ?
     WHERE id = ?`
  )

  const insertTaskStatement = database.prepare(
    `INSERT INTO jobs
      (id, type, status, schedule_type, profile_id, run_at, cadence_minutes, payload, last_run_at, next_run_at, terminal_state, terminal_reason, lock_token, lock_expires_at, created_at, updated_at)
     VALUES
      (@id, @type, @status, @scheduleType, @profileId, @runAt, @cadenceMinutes, @payload, @lastRunAt, @nextRunAt, @terminalState, @terminalReason, @lockToken, @lockExpiresAt, @createdAt, @updatedAt)`
  )

  const updateTaskStatement = database.prepare(
    `UPDATE jobs
     SET type = COALESCE(?, type),
         schedule_type = COALESCE(?, schedule_type),
         profile_id = ?,
         run_at = ?,
         cadence_minutes = ?,
         payload = ?,
         next_run_at = ?,
         updated_at = ?
     WHERE id = ?`
  )

  const cancelTaskStatement = database.prepare(
    `UPDATE jobs
     SET status = 'idle',
         next_run_at = NULL,
         terminal_state = 'cancelled',
         terminal_reason = ?,
         lock_token = NULL,
         lock_expires_at = NULL,
         updated_at = ?
     WHERE id = ?`
  )

  const listTasksStatement = database.prepare(
    `SELECT
      id,
      type,
      schedule_type as scheduleType,
      profile_id as profileId,
      status,
      run_at as runAt,
      cadence_minutes as cadenceMinutes,
      next_run_at as nextRunAt,
      terminal_state as terminalState,
      terminal_reason as terminalReason,
      updated_at as updatedAt
     FROM jobs
     ORDER BY updated_at DESC`
  )

  const insertRunStatement = database.prepare(
    `INSERT INTO job_runs
      (id, job_id, scheduled_for, started_at, finished_at, status, error_code, error_message, result_json, created_at)
     VALUES
      (@id, @jobId, @scheduledFor, @startedAt, @finishedAt, @status, @errorCode, @errorMessage, @resultJson, @createdAt)`
  )

  const markRunFinishedStatement = database.prepare(
    `UPDATE job_runs
     SET finished_at = ?,
         status = ?,
         error_code = ?,
         error_message = ?,
         result_json = ?
     WHERE id = ?`
  )

  const rescheduleRecurringStatement = database.prepare(
    `UPDATE jobs
     SET status = 'idle',
         last_run_at = ?,
         next_run_at = ?,
         terminal_state = NULL,
         terminal_reason = NULL,
         lock_token = NULL,
         lock_expires_at = NULL,
         updated_at = ?
     WHERE id = ?
       AND lock_token = ?`
  )

  const finalizeOneShotStatement = database.prepare(
    `UPDATE jobs
     SET status = 'idle',
         last_run_at = ?,
         next_run_at = NULL,
         terminal_state = ?,
         terminal_reason = ?,
         lock_token = NULL,
         lock_expires_at = NULL,
         updated_at = ?
     WHERE id = ?
       AND lock_token = ?`
  )

  const listRunsByJobIdStatement = database.prepare(
    `SELECT
      id,
      job_id as jobId,
      scheduled_for as scheduledFor,
      started_at as startedAt,
      finished_at as finishedAt,
      status,
      error_code as errorCode,
      error_message as errorMessage,
      result_json as resultJson,
      created_at as createdAt
     FROM job_runs
     WHERE job_id = ?
     ORDER BY started_at DESC`
  )

  const listRecentFailedRunsStatement = database.prepare(
    `SELECT
      r.id as runId,
      r.job_id as jobId,
      j.type as jobType,
      r.started_at as startedAt,
      r.error_code as errorCode,
      r.error_message as errorMessage
     FROM job_runs r
     JOIN jobs j ON j.id = r.job_id
     WHERE r.status = 'failed'
       AND r.started_at >= ?
     ORDER BY r.started_at DESC
     LIMIT ?`
  )

  const listRecentRunsStatement = database.prepare(
    `SELECT
      r.id as runId,
      r.job_id as jobId,
      j.type as jobType,
      r.started_at as startedAt,
      r.finished_at as finishedAt,
      r.status,
      r.error_code as errorCode,
      r.error_message as errorMessage,
      r.result_json as resultJson
     FROM job_runs r
     JOIN jobs j ON j.id = r.job_id
     WHERE r.started_at >= ?
     ORDER BY r.started_at DESC
     LIMIT ?`
  )

  const beginImmediate = (): void => {
    database.exec("BEGIN IMMEDIATE")
  }

  const commit = (): void => {
    database.exec("COMMIT")
  }

  const rollback = (): void => {
    database.exec("ROLLBACK")
  }

  return {
    upsert: (record: JobRecord): void => {
      upsertStatement.run(record)
    },
    listDue: (timestamp = Date.now()): JobRecord[] => {
      return listDueStatement.all(timestamp) as JobRecord[]
    },
    claimDue: (
      timestamp: number,
      limit: number,
      lockToken: string,
      lockLeaseMs: number,
      updatedAt = Date.now()
    ): JobRecord[] => {
      const lockExpiresAt = timestamp + lockLeaseMs

      beginImmediate()

      try {
        const candidateRows = selectClaimableIdsStatement.all(
          timestamp,
          timestamp,
          limit
        ) as Array<{
          id: string
        }>

        const claimedJobs: JobRecord[] = []

        for (const row of candidateRows) {
          const claimResult = claimByIdStatement.run(
            lockToken,
            lockExpiresAt,
            updatedAt,
            row.id,
            timestamp
          ) as { changes?: number }

          if ((claimResult.changes ?? 0) < 1) {
            continue
          }

          const claimedRow = getByIdStatement.get(row.id) as JobRecord | undefined
          if (claimedRow) {
            claimedJobs.push(claimedRow)
          }
        }

        commit()
        return claimedJobs
      } catch (error) {
        rollback()
        throw error
      }
    },
    releaseLock: (jobId: string, lockToken: string, updatedAt = Date.now()): void => {
      releaseLockStatement.run(updatedAt, jobId, lockToken)
    },
    insertRun: (record: JobRunRecord): void => {
      insertRunStatement.run(record)
    },
    markRunFinished: (
      runId: string,
      status: JobRunStatus,
      finishedAt: number,
      errorCode: string | null,
      errorMessage: string | null,
      resultJson: string | null
    ): void => {
      markRunFinishedStatement.run(finishedAt, status, errorCode, errorMessage, resultJson, runId)
    },
    rescheduleRecurring: (
      jobId: string,
      lockToken: string,
      lastRunAt: number,
      nextRunAt: number,
      updatedAt = Date.now()
    ): void => {
      rescheduleRecurringStatement.run(lastRunAt, nextRunAt, updatedAt, jobId, lockToken)
    },
    finalizeOneShot: (
      jobId: string,
      lockToken: string,
      terminalState: JobTerminalState,
      terminalReason: string | null,
      lastRunAt: number,
      updatedAt = Date.now()
    ): void => {
      finalizeOneShotStatement.run(
        lastRunAt,
        terminalState,
        terminalReason,
        updatedAt,
        jobId,
        lockToken
      )
    },
    listRunsByJobId: (jobId: string): JobRunRecord[] => {
      return listRunsByJobIdStatement.all(jobId) as JobRunRecord[]
    },
    listRecentFailedRuns: (sinceTimestamp: number, limit = 50): FailedJobRunRecord[] => {
      return listRecentFailedRunsStatement.all(sinceTimestamp, limit) as FailedJobRunRecord[]
    },
    listRecentRuns: (sinceTimestamp: number, limit = 200): JobRunSummaryRecord[] => {
      return listRecentRunsStatement.all(sinceTimestamp, limit) as JobRunSummaryRecord[]
    },
    getById: (jobId: string): JobRecord | null => {
      const row = getByIdStatement.get(jobId) as JobRecord | undefined
      return row ?? null
    },
    setProfile: (jobId: string, profileId: string | null, updatedAt = Date.now()): void => {
      setProfileStatement.run(profileId, updatedAt, jobId)
    },
    createTask: (record: JobRecord): void => {
      insertTaskStatement.run(record)
    },
    updateTask: (
      jobId: string,
      update: {
        type: string
        scheduleType: JobScheduleType
        profileId: string | null
        runAt: number | null
        cadenceMinutes: number | null
        payload: string | null
        nextRunAt: number | null
      },
      updatedAt = Date.now()
    ): void => {
      updateTaskStatement.run(
        update.type,
        update.scheduleType,
        update.profileId,
        update.runAt,
        update.cadenceMinutes,
        update.payload,
        update.nextRunAt,
        updatedAt,
        jobId
      )
    },
    cancelTask: (jobId: string, reason: string | null, updatedAt = Date.now()): void => {
      cancelTaskStatement.run(reason, updatedAt, jobId)
    },
    listTasks: (): TaskListRecord[] => {
      return listTasksStatement.all() as TaskListRecord[]
    },
  }
}

/**
 * Persists immutable task lifecycle audits so task mutations remain traceable over time.
 *
 * @param database Open SQLite database instance.
 * @returns Repository for task audit writes and reads.
 */
export const createTaskAuditRepository = (database: DatabaseSync) => {
  const insertStatement = database.prepare(
    `INSERT INTO task_audit_log
      (id, task_id, action, lane, actor, before_json, after_json, metadata_json, created_at)
     VALUES
      (@id, @taskId, @action, @lane, @actor, @beforeJson, @afterJson, @metadataJson, @createdAt)`
  )

  const listRecentStatement = database.prepare(
    `SELECT
      id,
      task_id as taskId,
      action,
      lane,
      actor,
      before_json as beforeJson,
      after_json as afterJson,
      metadata_json as metadataJson,
      created_at as createdAt
     FROM task_audit_log
     ORDER BY created_at DESC
     LIMIT ?`
  )

  return {
    insert: (record: TaskAuditRecord): void => {
      insertStatement.run(record)
    },
    listRecent: (limit = 50): TaskAuditRecord[] => {
      return listRecentStatement.all(limit) as TaskAuditRecord[]
    },
  }
}

/**
 * Tracks internal tool command executions for operational diagnostics and auditability.
 *
 * @param database Open SQLite database instance.
 * @returns Repository for command execution audit entries.
 */
export const createCommandAuditRepository = (database: DatabaseSync) => {
  const insertStatement = database.prepare(
    `INSERT INTO command_audit_log
      (id, command, lane, status, error_message, metadata_json, created_at)
     VALUES
      (@id, @command, @lane, @status, @errorMessage, @metadataJson, @createdAt)`
  )

  const listRecentStatement = database.prepare(
    `SELECT
      id,
      command,
      lane,
      status,
      error_message as errorMessage,
      metadata_json as metadataJson,
      created_at as createdAt
     FROM command_audit_log
     ORDER BY created_at DESC
     LIMIT ?`
  )

  return {
    insert: (record: CommandAuditRecord): void => {
      insertStatement.run(record)
    },
    listRecent: (limit = 100): CommandAuditRecord[] => {
      return listRecentStatement.all(limit) as CommandAuditRecord[]
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
      quiet_mode as quietMode,
      mute_until as muteUntil,
      heartbeat_morning as heartbeatMorning,
      heartbeat_midday as heartbeatMidday,
      heartbeat_evening as heartbeatEvening,
      heartbeat_cadence_minutes as heartbeatCadenceMinutes,
      heartbeat_only_if_signal as heartbeatOnlyIfSignal,
      onboarding_completed_at as onboardingCompletedAt,
      last_digest_at as lastDigestAt,
      updated_at as updatedAt
     FROM user_profile
     WHERE id = 1`
  )

  const upsertStatement = database.prepare(
    `INSERT INTO user_profile
      (id, timezone, quiet_hours_start, quiet_hours_end, quiet_mode, mute_until, heartbeat_morning, heartbeat_midday, heartbeat_evening, heartbeat_cadence_minutes, heartbeat_only_if_signal, onboarding_completed_at, last_digest_at, updated_at)
     VALUES
      (1, @timezone, @quietHoursStart, @quietHoursEnd, @quietMode, @muteUntil, @heartbeatMorning, @heartbeatMidday, @heartbeatEvening, @heartbeatCadenceMinutes, @heartbeatOnlyIfSignal, @onboardingCompletedAt, @lastDigestAt, @updatedAt)
     ON CONFLICT(id) DO UPDATE SET
      timezone = excluded.timezone,
      quiet_hours_start = excluded.quiet_hours_start,
      quiet_hours_end = excluded.quiet_hours_end,
      quiet_mode = excluded.quiet_mode,
      mute_until = excluded.mute_until,
      heartbeat_morning = excluded.heartbeat_morning,
      heartbeat_midday = excluded.heartbeat_midday,
      heartbeat_evening = excluded.heartbeat_evening,
      heartbeat_cadence_minutes = excluded.heartbeat_cadence_minutes,
      heartbeat_only_if_signal = excluded.heartbeat_only_if_signal,
      onboarding_completed_at = excluded.onboarding_completed_at,
      last_digest_at = excluded.last_digest_at,
      updated_at = excluded.updated_at`
  )

  const setMuteUntilStatement = database.prepare(
    `UPDATE user_profile
     SET mute_until = ?,
         updated_at = ?
     WHERE id = 1`
  )

  const setLastDigestAtStatement = database.prepare(
    `UPDATE user_profile
     SET last_digest_at = ?,
         updated_at = ?
     WHERE id = 1`
  )

  return {
    get: (): UserProfileRecord | null => {
      const row = getStatement.get() as
        | (Omit<UserProfileRecord, "heartbeatOnlyIfSignal"> & {
            heartbeatOnlyIfSignal: number | null
          })
        | undefined
      if (!row) {
        return null
      }

      return {
        ...row,
        quietMode:
          row.quietMode === "off" || row.quietMode === "critical_only"
            ? row.quietMode
            : "critical_only",
        heartbeatOnlyIfSignal: row.heartbeatOnlyIfSignal === 0 ? false : true,
      }
    },
    upsert: (record: UserProfileRecord): void => {
      upsertStatement.run({
        ...record,
        heartbeatOnlyIfSignal: record.heartbeatOnlyIfSignal ? 1 : 0,
        quietMode: record.quietMode ?? "critical_only",
      })
    },
    setMuteUntil: (muteUntil: number | null, updatedAt = Date.now()): void => {
      setMuteUntilStatement.run(muteUntil, updatedAt)
    },
    setLastDigestAt: (lastDigestAt: number, updatedAt = Date.now()): void => {
      setLastDigestAtStatement.run(lastDigestAt, updatedAt)
    },
  }
}
