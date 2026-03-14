import type { DatabaseSync } from "node:sqlite"

export type MessagePriority = "low" | "normal" | "high" | "critical"
export type OutboundMessageStatus = "queued" | "sent" | "failed" | "cancelled"
export type OutboundMessageKind = "text" | "document" | "photo"
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

type SessionIdRow = {
  sessionId: string
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

export type InboundMessageWindowRecord = {
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
  kind: OutboundMessageKind
  content: string
  mediaPath: string | null
  mediaMimeType: string | null
  mediaFilename: string | null
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

export type OutboundMessageWindowRecord = {
  id: string
  dedupeKey: string | null
  chatId: number
  kind: OutboundMessageKind
  content: string
  priority: MessagePriority
  status: OutboundMessageStatus
  attemptCount: number
  sentAt: number | null
  failedAt: number | null
  errorMessage: string | null
  createdAt: number
  updatedAt: number
}

export type MediaInboundStatus = "accepted" | "rejected" | "processed" | "failed"

export type MediaInboundMessageRecord = {
  id: string
  sourceMessageId: string
  chatId: number
  userId: number | null
  telegramFileId: string
  telegramFileUniqueId: string | null
  mediaType: "document" | "photo"
  mimeType: string | null
  fileName: string | null
  fileSizeBytes: number | null
  downloadedSizeBytes: number | null
  caption: string | null
  status: MediaInboundStatus
  rejectReason: string | null
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
  modelRef: string | null
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
  promptProvenanceJson?: string | null
  createdAt: number
}

export type JobRunSessionRecord = {
  runId: string
  jobId: string
  sessionId: string
  createdAt: number
  closedAt: number | null
  closeErrorMessage: string | null
  promptProvenanceJson?: string | null
}

export type JobRunSessionWindowRecord = {
  runId: string
  jobId: string
  sessionId: string
  createdAt: number
  closedAt: number | null
  closeErrorMessage: string | null
  promptProvenanceJson?: string | null
  runStartedAt: number
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
  modelRef: string | null
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
  watchdogAlertsEnabled?: boolean | null
  watchdogMuteUntil?: number | null
  interactiveContextWindowSize: number
  contextRetentionCap: number
  onboardingCompletedAt: number | null
  lastDigestAt: number | null
  updatedAt: number
}

export type InteractiveContextDeliveryStatus = "queued" | "sent" | "failed" | "held"

export type InteractiveContextEventRecord = {
  id: string
  sourceSessionId: string
  outboundMessageId: string
  sourceLane: string
  sourceKind: string
  sourceRef: string | null
  content: string
  deliveryStatus: InteractiveContextDeliveryStatus
  deliveryStatusDetail: string | null
  errorMessage: string | null
  createdAt: number
  updatedAt: number
}

export type EodLearningRunRecord = {
  id: string
  profileId: string | null
  lane: string
  windowStartedAt: number
  windowEndedAt: number
  startedAt: number
  finishedAt: number | null
  status: string
  summaryJson: string | null
  createdAt: number
}

export type EodLearningItemRecord = {
  id: string
  runId: string
  ordinal: number
  title: string
  decision: string
  confidence: number
  contradictionFlag: number
  expectedValue: number | null
  applyStatus: string
  applyError: string | null
  metadataJson: string | null
  createdAt: number
}

export type EodLearningEvidenceRecord = {
  id: string
  runId: string
  itemId: string
  ordinal: number
  signalGroup: string | null
  sourceKind: string
  sourceId: string
  occurredAt: number | null
  excerpt: string | null
  contradictionFlag: number
  metadataJson: string | null
  createdAt: number
}

export type EodLearningActionRecord = {
  id: string
  runId: string
  itemId: string
  ordinal: number
  actionType: string
  status: string
  expectedValue: number | null
  detail: string | null
  errorMessage: string | null
  metadataJson: string | null
  createdAt: number
}

export type EodLearningItemArtifacts = {
  item: EodLearningItemRecord
  evidence: EodLearningEvidenceRecord[]
  actions: EodLearningActionRecord[]
}

export type EodLearningRunArtifacts = {
  run: EodLearningRunRecord
  items: EodLearningItemArtifacts[]
}

export type EodLearningEvidenceReferenceRecord = {
  evidenceId: string
  runId: string
  itemId: string
  itemDecision: string
  itemConfidence: number
  itemContradictionFlag: number
  sourceKind: string
  sourceId: string
  signalGroup: string | null
  occurredAt: number
  excerpt: string | null
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

  const getLatestTelegramBindingByChatIdStatement = database.prepare(
    `SELECT
      session_id as sessionId
     FROM session_bindings
     WHERE binding_key = ?
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
    getSessionIdByTelegramChatId: (chatId: number): string | null => {
      const bindingKey = `telegram:chat:${chatId}:assistant`
      const row = getLatestTelegramBindingByChatIdStatement.get(bindingKey) as
        | SessionIdRow
        | undefined

      return row?.sessionId ?? null
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

  const listByReceivedWindowStatement = database.prepare(
    `SELECT
      id,
      source_message_id as sourceMessageId,
      chat_id as chatId,
      user_id as userId,
      content,
      received_at as receivedAt,
      session_id as sessionId,
      created_at as createdAt
     FROM messages_in
     WHERE received_at >= ?
       AND received_at < ?
     ORDER BY received_at DESC, id DESC
     LIMIT ?`
  )

  return {
    insert: (record: InboundMessageRecord): void => {
      insertStatement.run(record)
    },
    listByReceivedWindow: (
      windowStart: number,
      windowEnd: number,
      limit = 2_000
    ): InboundMessageWindowRecord[] => {
      const normalizedLimit = Number.isInteger(limit) ? Math.max(1, limit) : 2_000
      return listByReceivedWindowStatement.all(
        windowStart,
        windowEnd,
        normalizedLimit
      ) as InboundMessageWindowRecord[]
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
 * Persists non-voice media intake records so document/photo lifecycle outcomes stay auditable
 * without coupling this state to text prompt storage.
 *
 * @param database Open SQLite database instance.
 * @returns Repository for inbound media lifecycle writes.
 */
export const createMediaInboundMessagesRepository = (database: DatabaseSync) => {
  const insertStatement = database.prepare(
    `INSERT INTO messages_in_media
      (id, source_message_id, chat_id, user_id, telegram_file_id, telegram_file_unique_id, media_type, mime_type, file_name, file_size_bytes, downloaded_size_bytes, caption, status, reject_reason, error_message, created_at, updated_at)
     VALUES
      (@id, @sourceMessageId, @chatId, @userId, @telegramFileId, @telegramFileUniqueId, @mediaType, @mimeType, @fileName, @fileSizeBytes, @downloadedSizeBytes, @caption, @status, @rejectReason, @errorMessage, @createdAt, @updatedAt)`
  )

  const updateStatusStatement = database.prepare(
    `UPDATE messages_in_media
     SET downloaded_size_bytes = COALESCE(@downloadedSizeBytes, downloaded_size_bytes),
         status = @status,
         reject_reason = @rejectReason,
         error_message = @errorMessage,
         updated_at = @updatedAt
     WHERE source_message_id = @sourceMessageId`
  )

  return {
    insertOrIgnore: (record: MediaInboundMessageRecord): "inserted" | "duplicate" => {
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
        updatedAt,
      })
    },
    markProcessed: (
      sourceMessageId: string,
      updatedAt = Date.now(),
      downloadedSizeBytes: number | null = null
    ): void => {
      updateStatusStatement.run({
        sourceMessageId,
        downloadedSizeBytes,
        status: "processed",
        rejectReason: null,
        errorMessage: null,
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
      (id, dedupe_key, chat_id, kind, content, media_path, media_mime_type, media_filename, priority, status, attempt_count, next_attempt_at, sent_at, failed_at, error_message, created_at, updated_at)
     VALUES
      (@id, @dedupeKey, @chatId, @kind, @content, @mediaPath, @mediaMimeType, @mediaFilename, @priority, @status, @attemptCount, @nextAttemptAt, @sentAt, @failedAt, @errorMessage, @createdAt, @updatedAt)`
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
      kind,
      content,
      media_path as mediaPath,
      media_mime_type as mediaMimeType,
      media_filename as mediaFilename,
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

  const listByCreatedWindowStatement = database.prepare(
    `SELECT
      id,
      dedupe_key as dedupeKey,
      chat_id as chatId,
      kind,
      content,
      priority,
      status,
      attempt_count as attemptCount,
      sent_at as sentAt,
      failed_at as failedAt,
      error_message as errorMessage,
      created_at as createdAt,
      updated_at as updatedAt
     FROM messages_out
     WHERE created_at >= ?
       AND created_at < ?
     ORDER BY created_at DESC, id DESC
     LIMIT ?`
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
    listByCreatedWindow: (
      windowStart: number,
      windowEnd: number,
      limit = 2_000
    ): OutboundMessageWindowRecord[] => {
      const normalizedLimit = Number.isInteger(limit) ? Math.max(1, limit) : 2_000
      return listByCreatedWindowStatement.all(
        windowStart,
        windowEnd,
        normalizedLimit
      ) as OutboundMessageWindowRecord[]
    },
  }
}

/**
 * Persists interactive context events emitted by non-interactive lanes so follow-up prompts can
 * recover recent user-facing activity with deterministic delivery status transitions.
 *
 * @param database Open SQLite database instance.
 * @returns Repository for interactive context event writes, reads, and retention pruning.
 */
export const createInteractiveContextEventsRepository = (database: DatabaseSync) => {
  const insertStatement = database.prepare(
    `INSERT INTO interactive_context_events
      (id, source_session_id, outbound_message_id, source_lane, source_kind, source_ref, content, delivery_status, delivery_status_detail, error_message, created_at, updated_at)
     VALUES
      (@id, @sourceSessionId, @outboundMessageId, @sourceLane, @sourceKind, @sourceRef, @content, @deliveryStatus, @deliveryStatusDetail, @errorMessage, @createdAt, @updatedAt)`
  )

  const listRecentBySessionIdStatement = database.prepare(
    `SELECT
      id,
      source_session_id as sourceSessionId,
      outbound_message_id as outboundMessageId,
      source_lane as sourceLane,
      source_kind as sourceKind,
      source_ref as sourceRef,
      content,
      delivery_status as deliveryStatus,
      delivery_status_detail as deliveryStatusDetail,
      error_message as errorMessage,
      created_at as createdAt,
      updated_at as updatedAt
     FROM interactive_context_events
     WHERE source_session_id = ?
     ORDER BY created_at DESC, id DESC
     LIMIT ?`
  )

  const listByCreatedWindowStatement = database.prepare(
    `SELECT
      id,
      source_session_id as sourceSessionId,
      outbound_message_id as outboundMessageId,
      source_lane as sourceLane,
      source_kind as sourceKind,
      source_ref as sourceRef,
      content,
      delivery_status as deliveryStatus,
      delivery_status_detail as deliveryStatusDetail,
      error_message as errorMessage,
      created_at as createdAt,
      updated_at as updatedAt
     FROM interactive_context_events
     WHERE created_at >= ?
       AND created_at < ?
     ORDER BY created_at DESC, id DESC
     LIMIT ?`
  )

  const listByCreatedWindowUnboundedStatement = database.prepare(
    `SELECT
      id,
      source_session_id as sourceSessionId,
      outbound_message_id as outboundMessageId,
      source_lane as sourceLane,
      source_kind as sourceKind,
      source_ref as sourceRef,
      content,
      delivery_status as deliveryStatus,
      delivery_status_detail as deliveryStatusDetail,
      error_message as errorMessage,
      created_at as createdAt,
      updated_at as updatedAt
     FROM interactive_context_events
     WHERE created_at >= ?
       AND created_at < ?
     ORDER BY created_at DESC, id DESC`
  )

  const updateDeliveryStatusStatement = database.prepare(
    `UPDATE interactive_context_events
     SET delivery_status = ?,
         delivery_status_detail = ?,
         error_message = ?,
         updated_at = ?
     WHERE outbound_message_id = ?`
  )

  const selectSourceSessionIdByOutboundMessageIdStatement = database.prepare(
    `SELECT source_session_id as sourceSessionId
     FROM interactive_context_events
     WHERE outbound_message_id = ?`
  )

  const pruneBySessionCapStatement = database.prepare(
    `DELETE FROM interactive_context_events
     WHERE source_session_id = ?
       AND id IN (
         SELECT id
         FROM interactive_context_events
         WHERE source_session_id = ?
         ORDER BY created_at DESC, id DESC
         LIMIT -1 OFFSET ?
       )`
  )

  return {
    insert: (record: InteractiveContextEventRecord): void => {
      insertStatement.run(record)
    },
    listRecentBySourceSessionId: (
      sourceSessionId: string,
      limit = 20
    ): InteractiveContextEventRecord[] => {
      const normalizedLimit = Number.isInteger(limit) ? Math.max(1, limit) : 20
      return listRecentBySessionIdStatement.all(
        sourceSessionId,
        normalizedLimit
      ) as InteractiveContextEventRecord[]
    },
    listByCreatedWindow: (
      windowStart: number,
      windowEnd: number,
      limit?: number
    ): InteractiveContextEventRecord[] => {
      if (limit == null) {
        return listByCreatedWindowUnboundedStatement.all(
          windowStart,
          windowEnd
        ) as InteractiveContextEventRecord[]
      }

      const normalizedLimit = Number.isInteger(limit) ? Math.max(1, limit) : 200
      return listByCreatedWindowStatement.all(
        windowStart,
        windowEnd,
        normalizedLimit
      ) as InteractiveContextEventRecord[]
    },
    updateDeliveryStatusByOutboundMessageId: (
      outboundMessageId: string,
      update: {
        deliveryStatus: InteractiveContextDeliveryStatus
        deliveryStatusDetail?: string | null
        errorMessage?: string | null
      },
      updatedAt = Date.now()
    ): boolean => {
      const result = updateDeliveryStatusStatement.run(
        update.deliveryStatus,
        update.deliveryStatusDetail ?? null,
        update.errorMessage ?? null,
        updatedAt,
        outboundMessageId
      ) as { changes?: number }
      return (result.changes ?? 0) > 0
    },
    mirrorDeliveryStatusByOutboundMessageId: (
      outboundMessageId: string,
      update: {
        deliveryStatus: InteractiveContextDeliveryStatus
        deliveryStatusDetail?: string | null
        errorMessage?: string | null
      },
      options?: {
        updatedAt?: number
        retentionCap?: number
      }
    ): {
      updated: boolean
      sourceSessionId: string | null
      prunedCount: number
    } => {
      const updatedAt = options?.updatedAt ?? Date.now()
      const updated = updateDeliveryStatusStatement.run(
        update.deliveryStatus,
        update.deliveryStatusDetail ?? null,
        update.errorMessage ?? null,
        updatedAt,
        outboundMessageId
      ) as { changes?: number }

      if ((updated.changes ?? 0) < 1) {
        return {
          updated: false,
          sourceSessionId: null,
          prunedCount: 0,
        }
      }

      const sourceSessionRow = selectSourceSessionIdByOutboundMessageIdStatement.get(
        outboundMessageId
      ) as
        | {
            sourceSessionId: string
          }
        | undefined

      if (!sourceSessionRow) {
        return {
          updated: true,
          sourceSessionId: null,
          prunedCount: 0,
        }
      }

      if (typeof options?.retentionCap !== "number") {
        return {
          updated: true,
          sourceSessionId: sourceSessionRow.sourceSessionId,
          prunedCount: 0,
        }
      }

      const normalizedCap = Number.isInteger(options.retentionCap)
        ? Math.max(0, options.retentionCap)
        : 0
      const pruned = pruneBySessionCapStatement.run(
        sourceSessionRow.sourceSessionId,
        sourceSessionRow.sourceSessionId,
        normalizedCap
      ) as { changes?: number }

      return {
        updated: true,
        sourceSessionId: sourceSessionRow.sourceSessionId,
        prunedCount: pruned.changes ?? 0,
      }
    },
    pruneBySourceSessionId: (sourceSessionId: string, cap: number): number => {
      const normalizedCap = Number.isInteger(cap) ? Math.max(0, cap) : 0
      const result = pruneBySessionCapStatement.run(
        sourceSessionId,
        sourceSessionId,
        normalizedCap
      ) as { changes?: number }
      return result.changes ?? 0
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
      (id, type, status, schedule_type, profile_id, model_ref, run_at, cadence_minutes, payload, last_run_at, next_run_at, terminal_state, terminal_reason, lock_token, lock_expires_at, created_at, updated_at)
     VALUES
      (@id, @type, @status, @scheduleType, @profileId, @modelRef, @runAt, @cadenceMinutes, @payload, @lastRunAt, @nextRunAt, @terminalState, @terminalReason, @lockToken, @lockExpiresAt, @createdAt, @updatedAt)
     ON CONFLICT(id) DO UPDATE SET
       type = excluded.type,
       status = excluded.status,
       schedule_type = excluded.schedule_type,
       profile_id = excluded.profile_id,
        model_ref = excluded.model_ref,
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
      model_ref as modelRef,
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

  const claimCandidateByIdStatement = database.prepare(
    `UPDATE jobs
     SET status = 'running',
         lock_token = ?,
         lock_expires_at = ?,
         updated_at = ?
     WHERE id = ?
       AND next_run_at IS NOT NULL
       AND next_run_at <= ?
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
      model_ref as modelRef,
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
      (id, type, status, schedule_type, profile_id, model_ref, run_at, cadence_minutes, payload, last_run_at, next_run_at, terminal_state, terminal_reason, lock_token, lock_expires_at, created_at, updated_at)
     VALUES
      (@id, @type, @status, @scheduleType, @profileId, @modelRef, @runAt, @cadenceMinutes, @payload, @lastRunAt, @nextRunAt, @terminalState, @terminalReason, @lockToken, @lockExpiresAt, @createdAt, @updatedAt)`
  )

  const updateTaskStatement = database.prepare(
    `UPDATE jobs
     SET type = COALESCE(?, type),
         schedule_type = COALESCE(?, schedule_type),
         profile_id = ?,
         model_ref = ?,
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

  const runTaskNowStatement = database.prepare(
    `UPDATE jobs
     SET status = 'idle',
         next_run_at = ?,
         terminal_state = NULL,
         terminal_reason = NULL,
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
      model_ref as modelRef,
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
      (id, job_id, scheduled_for, started_at, finished_at, status, error_code, error_message, result_json, prompt_provenance_json, created_at)
     VALUES
      (@id, @jobId, @scheduledFor, @startedAt, @finishedAt, @status, @errorCode, @errorMessage, @resultJson, @promptProvenanceJson, @createdAt)`
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

  const setRunPromptProvenanceStatement = database.prepare(
    `UPDATE job_runs
     SET prompt_provenance_json = ?
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
       prompt_provenance_json as promptProvenanceJson,
       created_at as createdAt
       FROM job_runs
      WHERE job_id = ?
      ORDER BY started_at DESC`
  )

  const listRunsByJobIdPagedStatement = database.prepare(
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
       prompt_provenance_json as promptProvenanceJson,
       created_at as createdAt
     FROM job_runs
     WHERE job_id = ?
     ORDER BY started_at DESC
     LIMIT ? OFFSET ?`
  )

  const countRunsByJobIdStatement = database.prepare(
    `SELECT COUNT(1) as total
     FROM job_runs
     WHERE job_id = ?`
  )

  const getRunByIdStatement = database.prepare(
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
       prompt_provenance_json as promptProvenanceJson,
       created_at as createdAt
     FROM job_runs
     WHERE job_id = ?
       AND id = ?`
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
       r.result_json as resultJson,
       r.prompt_provenance_json as promptProvenanceJson
      FROM job_runs r
     JOIN jobs j ON j.id = r.job_id
     WHERE r.started_at >= ?
     ORDER BY r.started_at DESC
     LIMIT ?`
  )

  const listRunsByWindowStatement = database.prepare(
    `SELECT
      r.id as runId,
      r.job_id as jobId,
      j.type as jobType,
      r.started_at as startedAt,
      r.finished_at as finishedAt,
       r.status,
       r.error_code as errorCode,
       r.error_message as errorMessage,
       r.result_json as resultJson,
       r.prompt_provenance_json as promptProvenanceJson
      FROM job_runs r
     JOIN jobs j ON j.id = r.job_id
     WHERE r.started_at >= ?
       AND r.started_at < ?
     ORDER BY r.started_at DESC`
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
          const claimResult = claimCandidateByIdStatement.run(
            lockToken,
            lockExpiresAt,
            updatedAt,
            row.id,
            timestamp,
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
    claimById: (
      jobId: string,
      timestamp: number,
      lockToken: string,
      lockLeaseMs: number,
      updatedAt = Date.now()
    ): JobRecord | null => {
      const lockExpiresAt = timestamp + lockLeaseMs
      const claimResult = claimCandidateByIdStatement.run(
        lockToken,
        lockExpiresAt,
        updatedAt,
        jobId,
        timestamp,
        timestamp
      ) as { changes?: number }

      if ((claimResult.changes ?? 0) < 1) {
        return null
      }

      const row = getByIdStatement.get(jobId) as JobRecord | undefined
      return row ?? null
    },
    insertRun: (record: JobRunRecord): void => {
      insertRunStatement.run({
        ...record,
        promptProvenanceJson: record.promptProvenanceJson ?? null,
      })
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
    setRunPromptProvenance: (runId: string, promptProvenanceJson: string | null): void => {
      setRunPromptProvenanceStatement.run(promptProvenanceJson, runId)
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
    listRunsByJobId: (
      jobId: string,
      options?: {
        limit?: number
        offset?: number
      }
    ): JobRunRecord[] => {
      if (typeof options?.limit === "number") {
        const limit = Number.isInteger(options.limit) ? Math.max(1, options.limit) : 50
        const offset =
          typeof options.offset === "number" && Number.isInteger(options.offset)
            ? Math.max(0, options.offset)
            : 0

        return listRunsByJobIdPagedStatement.all(jobId, limit, offset) as JobRunRecord[]
      }

      return listRunsByJobIdStatement.all(jobId) as JobRunRecord[]
    },
    countRunsByJobId: (jobId: string): number => {
      const row = countRunsByJobIdStatement.get(jobId) as { total: number } | undefined
      return row?.total ?? 0
    },
    getRunById: (jobId: string, runId: string): JobRunRecord | null => {
      const row = getRunByIdStatement.get(jobId, runId) as JobRunRecord | undefined
      return row ?? null
    },
    listRecentFailedRuns: (sinceTimestamp: number, limit = 50): FailedJobRunRecord[] => {
      return listRecentFailedRunsStatement.all(sinceTimestamp, limit) as FailedJobRunRecord[]
    },
    listRecentRuns: (sinceTimestamp: number, limit = 200): JobRunSummaryRecord[] => {
      return listRecentRunsStatement.all(sinceTimestamp, limit) as JobRunSummaryRecord[]
    },
    listRunsByWindow: (windowStart: number, windowEnd: number): JobRunSummaryRecord[] => {
      return listRunsByWindowStatement.all(windowStart, windowEnd) as JobRunSummaryRecord[]
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
        modelRef: string | null
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
        update.modelRef,
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
    runTaskNow: (jobId: string, scheduledFor: number, updatedAt = Date.now()): void => {
      runTaskNowStatement.run(scheduledFor, updatedAt, jobId)
    },
    listTasks: (): TaskListRecord[] => {
      return listTasksStatement.all() as TaskListRecord[]
    },
  }
}

/**
 * Persists OpenCode session lifecycle metadata per run so background execution can be
 * observed, debugged, and controlled across process restarts.
 *
 * @param database Open SQLite database instance.
 * @returns Repository for run session lifecycle persistence.
 */
export const createJobRunSessionsRepository = (database: DatabaseSync) => {
  const insertStatement = database.prepare(
    `INSERT INTO job_run_sessions
      (run_id, job_id, session_id, created_at, closed_at, close_error_message, prompt_provenance_json)
     VALUES
      (?, ?, ?, ?, NULL, NULL, ?)`
  )

  const markClosedStatement = database.prepare(
    `UPDATE job_run_sessions
     SET closed_at = ?,
         close_error_message = ?
     WHERE run_id = ?`
  )

  const markCloseErrorStatement = database.prepare(
    `UPDATE job_run_sessions
     SET close_error_message = ?
     WHERE run_id = ?
       AND closed_at IS NULL`
  )

  const getByRunIdStatement = database.prepare(
    `SELECT
      run_id as runId,
      job_id as jobId,
       session_id as sessionId,
       created_at as createdAt,
       closed_at as closedAt,
       close_error_message as closeErrorMessage,
       prompt_provenance_json as promptProvenanceJson
     FROM job_run_sessions
     WHERE run_id = ?`
  )

  const listActiveByJobIdStatement = database.prepare(
    `SELECT
      run_id as runId,
      job_id as jobId,
       session_id as sessionId,
       created_at as createdAt,
       closed_at as closedAt,
       close_error_message as closeErrorMessage,
       prompt_provenance_json as promptProvenanceJson
     FROM job_run_sessions
     WHERE job_id = ?
       AND closed_at IS NULL
     ORDER BY created_at DESC`
  )

  const getLatestActiveBySessionIdStatement = database.prepare(
    `SELECT
      run_id as runId,
      job_id as jobId,
       session_id as sessionId,
       created_at as createdAt,
       closed_at as closedAt,
       close_error_message as closeErrorMessage,
       prompt_provenance_json as promptProvenanceJson
     FROM job_run_sessions
     WHERE session_id = ?
       AND closed_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1`
  )

  const setPromptProvenanceStatement = database.prepare(
    `UPDATE job_run_sessions
     SET prompt_provenance_json = ?
     WHERE run_id = ?`
  )

  const listByRunStartedWindowStatement = database.prepare(
    `SELECT
      s.run_id as runId,
      s.job_id as jobId,
      s.session_id as sessionId,
      s.created_at as createdAt,
      s.closed_at as closedAt,
      s.close_error_message as closeErrorMessage,
      s.prompt_provenance_json as promptProvenanceJson,
      r.started_at as runStartedAt
     FROM job_run_sessions s
     JOIN job_runs r ON r.id = s.run_id
     WHERE r.started_at >= ?
       AND r.started_at < ?
     ORDER BY r.started_at DESC, s.run_id DESC
     LIMIT ?`
  )

  return {
    insert: (record: {
      runId: string
      jobId: string
      sessionId: string
      createdAt: number
      promptProvenanceJson?: string | null
    }): void => {
      insertStatement.run(
        record.runId,
        record.jobId,
        record.sessionId,
        record.createdAt,
        record.promptProvenanceJson ?? null
      )
    },
    markClosed: (runId: string, closedAt: number, closeErrorMessage: string | null): void => {
      markClosedStatement.run(closedAt, closeErrorMessage, runId)
    },
    markCloseError: (runId: string, closeErrorMessage: string): void => {
      markCloseErrorStatement.run(closeErrorMessage, runId)
    },
    getByRunId: (runId: string): JobRunSessionRecord | null => {
      const row = getByRunIdStatement.get(runId) as JobRunSessionRecord | undefined
      return row ?? null
    },
    listActiveByJobId: (jobId: string): JobRunSessionRecord[] => {
      return listActiveByJobIdStatement.all(jobId) as JobRunSessionRecord[]
    },
    getLatestActiveBySessionId: (sessionId: string): JobRunSessionRecord | null => {
      const row = getLatestActiveBySessionIdStatement.get(sessionId) as
        | JobRunSessionRecord
        | undefined
      return row ?? null
    },
    setPromptProvenance: (runId: string, promptProvenanceJson: string | null): void => {
      setPromptProvenanceStatement.run(promptProvenanceJson, runId)
    },
    listByRunStartedWindow: (
      windowStart: number,
      windowEnd: number,
      limit = 2_000
    ): JobRunSessionWindowRecord[] => {
      const normalizedLimit = Number.isInteger(limit) ? Math.max(1, limit) : 2_000
      return listByRunStartedWindowStatement.all(
        windowStart,
        windowEnd,
        normalizedLimit
      ) as JobRunSessionWindowRecord[]
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

  const listByTaskIdStatement = database.prepare(
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
     WHERE task_id = ?
     ORDER BY created_at DESC
     LIMIT ?`
  )

  const listByCreatedWindowStatement = database.prepare(
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
     WHERE created_at >= ?
       AND created_at < ?
     ORDER BY created_at DESC, id DESC`
  )

  return {
    insert: (record: TaskAuditRecord): void => {
      insertStatement.run(record)
    },
    listRecent: (limit = 50): TaskAuditRecord[] => {
      return listRecentStatement.all(limit) as TaskAuditRecord[]
    },
    listByTaskId: (taskId: string, limit = 50): TaskAuditRecord[] => {
      return listByTaskIdStatement.all(taskId, limit) as TaskAuditRecord[]
    },
    listByCreatedWindow: (windowStart: number, windowEnd: number): TaskAuditRecord[] => {
      return listByCreatedWindowStatement.all(windowStart, windowEnd) as TaskAuditRecord[]
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

  const listByCreatedWindowStatement = database.prepare(
    `SELECT
      id,
      command,
      lane,
      status,
      error_message as errorMessage,
      metadata_json as metadataJson,
      created_at as createdAt
     FROM command_audit_log
     WHERE created_at >= ?
       AND created_at < ?
     ORDER BY created_at DESC, id DESC`
  )

  return {
    insert: (record: CommandAuditRecord): void => {
      insertStatement.run(record)
    },
    listRecent: (limit = 100): CommandAuditRecord[] => {
      return listRecentStatement.all(limit) as CommandAuditRecord[]
    },
    listByCreatedWindow: (windowStart: number, windowEnd: number): CommandAuditRecord[] => {
      return listByCreatedWindowStatement.all(windowStart, windowEnd) as CommandAuditRecord[]
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
      watchdog_alerts_enabled as watchdogAlertsEnabled,
      watchdog_mute_until as watchdogMuteUntil,
      interactive_context_window_size as interactiveContextWindowSize,
      context_retention_cap as contextRetentionCap,
      onboarding_completed_at as onboardingCompletedAt,
      last_digest_at as lastDigestAt,
      updated_at as updatedAt
     FROM user_profile
     WHERE id = 1`
  )

  const upsertStatement = database.prepare(
    `INSERT INTO user_profile
      (id, timezone, quiet_hours_start, quiet_hours_end, quiet_mode, mute_until, watchdog_alerts_enabled, watchdog_mute_until, interactive_context_window_size, context_retention_cap, onboarding_completed_at, last_digest_at, updated_at)
     VALUES
      (1, @timezone, @quietHoursStart, @quietHoursEnd, @quietMode, @muteUntil, @watchdogAlertsEnabled, @watchdogMuteUntil, @interactiveContextWindowSize, @contextRetentionCap, @onboardingCompletedAt, @lastDigestAt, @updatedAt)
     ON CONFLICT(id) DO UPDATE SET
      timezone = excluded.timezone,
      quiet_hours_start = excluded.quiet_hours_start,
      quiet_hours_end = excluded.quiet_hours_end,
      quiet_mode = excluded.quiet_mode,
      mute_until = excluded.mute_until,
      watchdog_alerts_enabled = excluded.watchdog_alerts_enabled,
      watchdog_mute_until = excluded.watchdog_mute_until,
      interactive_context_window_size = excluded.interactive_context_window_size,
      context_retention_cap = excluded.context_retention_cap,
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
        | (Omit<UserProfileRecord, "interactiveContextWindowSize" | "contextRetentionCap"> & {
            interactiveContextWindowSize: number | null
            contextRetentionCap: number | null
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
        watchdogAlertsEnabled:
          typeof row.watchdogAlertsEnabled === "number"
            ? row.watchdogAlertsEnabled !== 0
            : (row.watchdogAlertsEnabled ?? true),
        watchdogMuteUntil: row.watchdogMuteUntil ?? null,
        interactiveContextWindowSize:
          row.interactiveContextWindowSize != null ? row.interactiveContextWindowSize : 20,
        contextRetentionCap: row.contextRetentionCap != null ? row.contextRetentionCap : 100,
      }
    },
    upsert: (record: UserProfileRecord): void => {
      upsertStatement.run({
        ...record,
        quietMode: record.quietMode ?? "critical_only",
        watchdogAlertsEnabled: (record.watchdogAlertsEnabled ?? true) ? 1 : 0,
        watchdogMuteUntil: record.watchdogMuteUntil ?? null,
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

/**
 * Persists EOD learning artifacts in a normalized schema so nightly decisions remain
 * fully auditable and queryable by runtime services.
 *
 * @param database Open SQLite database instance.
 * @returns Repository for EOD run/item/evidence/action writes and reads.
 */
export const createEodLearningRepository = (database: DatabaseSync) => {
  const insertRunStatement = database.prepare(
    `INSERT INTO eod_learning_runs
      (id, profile_id, lane, window_started_at, window_ended_at, started_at, finished_at, status, summary_json, created_at)
     VALUES
      (@id, @profileId, @lane, @windowStartedAt, @windowEndedAt, @startedAt, @finishedAt, @status, @summaryJson, @createdAt)`
  )

  const insertItemStatement = database.prepare(
    `INSERT INTO eod_learning_items
      (id, run_id, ordinal, title, decision, confidence, contradiction_flag, expected_value, apply_status, apply_error, metadata_json, created_at)
     VALUES
      (@id, @runId, @ordinal, @title, @decision, @confidence, @contradictionFlag, @expectedValue, @applyStatus, @applyError, @metadataJson, @createdAt)`
  )

  const insertEvidenceStatement = database.prepare(
    `INSERT INTO eod_learning_evidence
      (id, run_id, item_id, ordinal, signal_group, source_kind, source_id, occurred_at, excerpt, contradiction_flag, metadata_json, created_at)
     VALUES
      (@id, @runId, @itemId, @ordinal, @signalGroup, @sourceKind, @sourceId, @occurredAt, @excerpt, @contradictionFlag, @metadataJson, @createdAt)`
  )

  const insertActionStatement = database.prepare(
    `INSERT INTO eod_learning_actions
      (id, run_id, item_id, ordinal, action_type, status, expected_value, detail, error_message, metadata_json, created_at)
     VALUES
      (@id, @runId, @itemId, @ordinal, @actionType, @status, @expectedValue, @detail, @errorMessage, @metadataJson, @createdAt)`
  )

  const listRecentRunsStatement = database.prepare(
    `SELECT
      id,
      profile_id as profileId,
      lane,
      window_started_at as windowStartedAt,
      window_ended_at as windowEndedAt,
      started_at as startedAt,
      finished_at as finishedAt,
      status,
      summary_json as summaryJson,
      created_at as createdAt
     FROM eod_learning_runs
     ORDER BY created_at DESC, id DESC
     LIMIT ?`
  )

  const getRunByIdStatement = database.prepare(
    `SELECT
      id,
      profile_id as profileId,
      lane,
      window_started_at as windowStartedAt,
      window_ended_at as windowEndedAt,
      started_at as startedAt,
      finished_at as finishedAt,
      status,
      summary_json as summaryJson,
      created_at as createdAt
     FROM eod_learning_runs
     WHERE id = ?`
  )

  const listRecentRunsByStatusStatement = database.prepare(
    `SELECT
      id,
      profile_id as profileId,
      lane,
      window_started_at as windowStartedAt,
      window_ended_at as windowEndedAt,
      started_at as startedAt,
      finished_at as finishedAt,
      status,
      summary_json as summaryJson,
      created_at as createdAt
     FROM eod_learning_runs
     WHERE status = ?
     ORDER BY created_at DESC, id DESC
     LIMIT ?`
  )

  const listRecentRunsByProfileIdStatement = database.prepare(
    `SELECT
      id,
      profile_id as profileId,
      lane,
      window_started_at as windowStartedAt,
      window_ended_at as windowEndedAt,
      started_at as startedAt,
      finished_at as finishedAt,
      status,
      summary_json as summaryJson,
      created_at as createdAt
     FROM eod_learning_runs
     WHERE profile_id = ?
     ORDER BY created_at DESC, id DESC
     LIMIT ?`
  )

  const listRecentRunsByStatusAndProfileIdStatement = database.prepare(
    `SELECT
      id,
      profile_id as profileId,
      lane,
      window_started_at as windowStartedAt,
      window_ended_at as windowEndedAt,
      started_at as startedAt,
      finished_at as finishedAt,
      status,
      summary_json as summaryJson,
      created_at as createdAt
     FROM eod_learning_runs
     WHERE status = ?
       AND profile_id = ?
     ORDER BY created_at DESC, id DESC
     LIMIT ?`
  )

  const listItemsByRunIdStatement = database.prepare(
    `SELECT
      id,
      run_id as runId,
      ordinal,
      title,
      decision,
      confidence,
      contradiction_flag as contradictionFlag,
      expected_value as expectedValue,
      apply_status as applyStatus,
      apply_error as applyError,
      metadata_json as metadataJson,
      created_at as createdAt
     FROM eod_learning_items
     WHERE run_id = ?
     ORDER BY ordinal ASC, created_at ASC, id ASC`
  )

  const listEvidenceByRunIdStatement = database.prepare(
    `SELECT
      id,
      run_id as runId,
      item_id as itemId,
      ordinal,
      signal_group as signalGroup,
      source_kind as sourceKind,
      source_id as sourceId,
      occurred_at as occurredAt,
      excerpt,
      contradiction_flag as contradictionFlag,
      metadata_json as metadataJson,
      created_at as createdAt
     FROM eod_learning_evidence
     WHERE run_id = ?
     ORDER BY item_id ASC, ordinal ASC, created_at ASC, id ASC`
  )

  const listActionsByRunIdStatement = database.prepare(
    `SELECT
      id,
      run_id as runId,
      item_id as itemId,
      ordinal,
      action_type as actionType,
      status,
      expected_value as expectedValue,
      detail,
      error_message as errorMessage,
      metadata_json as metadataJson,
      created_at as createdAt
     FROM eod_learning_actions
     WHERE run_id = ?
     ORDER BY item_id ASC, ordinal ASC, created_at ASC, id ASC`
  )

  const listWindowEvidenceReferencesStatement = database.prepare(
    `SELECT
      e.id as evidenceId,
      e.run_id as runId,
      e.item_id as itemId,
      i.decision as itemDecision,
      i.confidence as itemConfidence,
      i.contradiction_flag as itemContradictionFlag,
      e.source_kind as sourceKind,
      e.source_id as sourceId,
     e.signal_group as signalGroup,
      e.occurred_at as occurredAt,
      e.excerpt as excerpt
     FROM eod_learning_evidence e
     JOIN eod_learning_items i
       ON i.id = e.item_id
      AND i.run_id = e.run_id
     WHERE e.occurred_at IS NOT NULL
       AND e.occurred_at >= ?
       AND e.occurred_at < ?
     ORDER BY e.occurred_at DESC, e.id DESC
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
    insertRunWithArtifacts: (record: EodLearningRunArtifacts): void => {
      beginImmediate()

      try {
        insertRunStatement.run(record.run)

        for (const itemArtifacts of record.items) {
          if (itemArtifacts.item.runId !== record.run.id) {
            throw new Error(
              `EOD item run mismatch: item ${itemArtifacts.item.id} belongs to ${itemArtifacts.item.runId} but run is ${record.run.id}`
            )
          }

          insertItemStatement.run(itemArtifacts.item)

          for (const evidence of itemArtifacts.evidence) {
            if (evidence.runId !== record.run.id || evidence.itemId !== itemArtifacts.item.id) {
              throw new Error(
                `EOD evidence linkage mismatch: evidence ${evidence.id} must reference run ${record.run.id} and item ${itemArtifacts.item.id}`
              )
            }

            insertEvidenceStatement.run(evidence)
          }

          for (const action of itemArtifacts.actions) {
            if (action.runId !== record.run.id || action.itemId !== itemArtifacts.item.id) {
              throw new Error(
                `EOD action linkage mismatch: action ${action.id} must reference run ${record.run.id} and item ${itemArtifacts.item.id}`
              )
            }

            insertActionStatement.run(action)
          }
        }

        commit()
      } catch (error) {
        rollback()
        throw error
      }
    },
    listRecentRuns: (limit = 20): EodLearningRunRecord[] => {
      const normalizedLimit = Number.isInteger(limit) ? Math.max(1, limit) : 20
      return listRecentRunsStatement.all(normalizedLimit) as EodLearningRunRecord[]
    },
    listRecentRunsByFilter: (
      filter: {
        status?: string
        profileId?: string
      },
      limit = 20
    ): EodLearningRunRecord[] => {
      const normalizedLimit = Number.isInteger(limit) ? Math.max(1, limit) : 20

      if (filter.status && filter.profileId) {
        return listRecentRunsByStatusAndProfileIdStatement.all(
          filter.status,
          filter.profileId,
          normalizedLimit
        ) as EodLearningRunRecord[]
      }

      if (filter.status) {
        return listRecentRunsByStatusStatement.all(
          filter.status,
          normalizedLimit
        ) as EodLearningRunRecord[]
      }

      if (filter.profileId) {
        return listRecentRunsByProfileIdStatement.all(
          filter.profileId,
          normalizedLimit
        ) as EodLearningRunRecord[]
      }

      return listRecentRunsStatement.all(normalizedLimit) as EodLearningRunRecord[]
    },
    getRunDetails: (runId: string): EodLearningRunArtifacts | null => {
      const run = getRunByIdStatement.get(runId) as EodLearningRunRecord | undefined
      if (!run) {
        return null
      }

      const items = listItemsByRunIdStatement.all(runId) as EodLearningItemRecord[]
      const evidenceRows = listEvidenceByRunIdStatement.all(runId) as EodLearningEvidenceRecord[]
      const actionRows = listActionsByRunIdStatement.all(runId) as EodLearningActionRecord[]

      const evidenceByItemId = new Map<string, EodLearningEvidenceRecord[]>()
      for (const evidence of evidenceRows) {
        const existing = evidenceByItemId.get(evidence.itemId)
        if (existing) {
          existing.push(evidence)
          continue
        }

        evidenceByItemId.set(evidence.itemId, [evidence])
      }

      const actionsByItemId = new Map<string, EodLearningActionRecord[]>()
      for (const action of actionRows) {
        const existing = actionsByItemId.get(action.itemId)
        if (existing) {
          existing.push(action)
          continue
        }

        actionsByItemId.set(action.itemId, [action])
      }

      return {
        run,
        items: items.map((item) => ({
          item,
          evidence: evidenceByItemId.get(item.id) ?? [],
          actions: actionsByItemId.get(item.id) ?? [],
        })),
      }
    },
    listWindowEvidenceReferences: (
      windowStart: number,
      windowEnd: number,
      limit = 200
    ): EodLearningEvidenceReferenceRecord[] => {
      const normalizedLimit = Number.isInteger(limit) ? Math.max(1, limit) : 200
      return listWindowEvidenceReferencesStatement.all(
        windowStart,
        windowEnd,
        normalizedLimit
      ) as EodLearningEvidenceReferenceRecord[]
    },
  }
}
