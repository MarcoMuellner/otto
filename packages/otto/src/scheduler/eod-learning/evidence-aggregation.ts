import type {
  CommandAuditRecord,
  InboundMessageWindowRecord,
  InteractiveContextEventRecord,
  JobRunSessionWindowRecord,
  JobRunSummaryRecord,
  OutboundMessageWindowRecord,
  TaskAuditRecord,
} from "../../persistence/repositories.js"
import {
  eodEvidenceBundleSchema,
  type EodEvidenceBundle,
  type EodEvidenceEntry,
  type EodEvidenceSignalGroup,
} from "./schemas.js"

type EodEvidenceAggregationInput = {
  windowStartedAt: number
  windowEndedAt: number
  taskAudit?: TaskAuditRecord[]
  commandAudit?: CommandAuditRecord[]
  jobRuns?: JobRunSummaryRecord[]
  jobRunSessions?: JobRunSessionWindowRecord[]
  interactiveContextEvents?: InteractiveContextEventRecord[]
  inboundMessages?: InboundMessageWindowRecord[]
  outboundMessages?: OutboundMessageWindowRecord[]
  resolveSessionIdByChatId?: (chatId: number) => string | null
}

const MAX_MESSAGE_EXCERPT_CHARS = 280
const MAX_INBOUND_PER_SESSION = 6
const MAX_OUTBOUND_PER_SESSION = 6

const normalizeText = (value: string | null | undefined): string | null => {
  if (typeof value !== "string") {
    return null
  }

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

const trimExcerpt = (value: string | null | undefined): string | null => {
  const normalized = normalizeText(value)
  if (!normalized) {
    return null
  }

  if (normalized.length <= MAX_MESSAGE_EXCERPT_CHARS) {
    return normalized
  }

  return `${normalized.slice(0, MAX_MESSAGE_EXCERPT_CHARS - 1)}...`
}

const tryParseJsonRecord = (value: string | null | undefined): Record<string, unknown> | null => {
  if (typeof value !== "string") {
    return null
  }

  try {
    const parsed = JSON.parse(value)
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null
    }

    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

const isWithinWindow = (
  timestamp: number,
  windowStartedAt: number,
  windowEndedAt: number
): boolean => {
  if (!Number.isInteger(timestamp)) {
    return false
  }

  return timestamp >= windowStartedAt && timestamp < windowEndedAt
}

const buildTaskAuditEvidence = (
  record: TaskAuditRecord,
  windowStartedAt: number,
  windowEndedAt: number
): EodEvidenceEntry | null => {
  if (!isWithinWindow(record.createdAt, windowStartedAt, windowEndedAt)) {
    return null
  }

  return {
    id: `task_audit:${record.id}`,
    sourceKind: "task_audit",
    sourceId: record.id,
    signalGroup: "tasks",
    lane: record.lane,
    occurredAt: record.createdAt,
    excerpt: `${record.action} task ${record.taskId}`,
    trace: {
      reference: `task_audit_log:${record.id}`,
      sourceRef: null,
    },
    metadata: {
      taskId: record.taskId,
      action: record.action,
      actor: normalizeText(record.actor),
      beforeJson: record.beforeJson,
      afterJson: record.afterJson,
      auditMetadata: tryParseJsonRecord(record.metadataJson),
    },
  }
}

const buildCommandAuditEvidence = (
  record: CommandAuditRecord,
  windowStartedAt: number,
  windowEndedAt: number
): EodEvidenceEntry | null => {
  if (!isWithinWindow(record.createdAt, windowStartedAt, windowEndedAt)) {
    return null
  }

  return {
    id: `command_audit:${record.id}`,
    sourceKind: "command_audit",
    sourceId: record.id,
    signalGroup: "commands",
    lane: record.lane,
    occurredAt: record.createdAt,
    excerpt: normalizeText(record.errorMessage)
      ? `${record.command} ${record.status}: ${record.errorMessage}`
      : `${record.command} ${record.status}`,
    trace: {
      reference: `command_audit_log:${record.id}`,
      sourceRef: null,
    },
    metadata: {
      command: record.command,
      status: record.status,
      errorMessage: normalizeText(record.errorMessage),
      auditMetadata: tryParseJsonRecord(record.metadataJson),
    },
  }
}

const buildJobRunEvidence = (
  record: JobRunSummaryRecord,
  windowStartedAt: number,
  windowEndedAt: number
): EodEvidenceEntry | null => {
  if (!isWithinWindow(record.startedAt, windowStartedAt, windowEndedAt)) {
    return null
  }

  return {
    id: `job_run:${record.runId}`,
    sourceKind: "job_run",
    sourceId: record.runId,
    signalGroup: "jobs",
    lane: "scheduled",
    occurredAt: record.startedAt,
    excerpt: normalizeText(record.errorMessage)
      ? `${record.jobType} ${record.status}: ${record.errorMessage}`
      : `${record.jobType} ${record.status}`,
    trace: {
      reference: `job_runs:${record.runId}`,
      sourceRef: record.jobId,
    },
    metadata: {
      jobId: record.jobId,
      jobType: record.jobType,
      status: record.status,
      errorCode: record.errorCode,
      errorMessage: normalizeText(record.errorMessage),
      finishedAt: record.finishedAt,
      resultJson: tryParseJsonRecord(record.resultJson),
    },
  }
}

const buildInteractiveContextEvidence = (
  record: InteractiveContextEventRecord,
  windowStartedAt: number,
  windowEndedAt: number
): EodEvidenceEntry | null => {
  if (!isWithinWindow(record.createdAt, windowStartedAt, windowEndedAt)) {
    return null
  }

  return {
    id: `interactive_context:${record.id}`,
    sourceKind: "interactive_context",
    sourceId: record.id,
    signalGroup: "interactive_context",
    lane: record.sourceLane,
    occurredAt: record.createdAt,
    excerpt: normalizeText(record.content),
    trace: {
      reference: `interactive_context_events:${record.id}`,
      sourceRef: normalizeText(record.sourceRef),
    },
    metadata: {
      sourceSessionId: record.sourceSessionId,
      outboundMessageId: record.outboundMessageId,
      sourceKind: record.sourceKind,
      deliveryStatus: record.deliveryStatus,
      deliveryStatusDetail: normalizeText(record.deliveryStatusDetail),
      errorMessage: normalizeText(record.errorMessage),
    },
  }
}

const buildInboundMessageEvidence = (
  record: InboundMessageWindowRecord,
  windowStartedAt: number,
  windowEndedAt: number
): EodEvidenceEntry | null => {
  if (!isWithinWindow(record.receivedAt, windowStartedAt, windowEndedAt)) {
    return null
  }

  return {
    id: `inbound_message:${record.id}`,
    sourceKind: "inbound_message",
    sourceId: record.id,
    signalGroup: "interactive_messages",
    lane: "interactive",
    occurredAt: record.receivedAt,
    excerpt: trimExcerpt(record.content),
    trace: {
      reference: `messages_in:${record.id}`,
      sourceRef: record.sessionId ? `session:${record.sessionId}` : `chat:${record.chatId}`,
    },
    metadata: {
      sourceMessageId: record.sourceMessageId,
      chatId: record.chatId,
      userId: record.userId,
      sourceSessionId: record.sessionId,
    },
  }
}

const buildOutboundMessageEvidence = (
  record: OutboundMessageWindowRecord,
  sourceSessionId: string | null,
  windowStartedAt: number,
  windowEndedAt: number
): EodEvidenceEntry | null => {
  if (!isWithinWindow(record.createdAt, windowStartedAt, windowEndedAt)) {
    return null
  }

  return {
    id: `outbound_message:${record.id}`,
    sourceKind: "outbound_message",
    sourceId: record.id,
    signalGroup: "interactive_messages",
    lane: "interactive",
    occurredAt: record.createdAt,
    excerpt: trimExcerpt(record.content),
    trace: {
      reference: `messages_out:${record.id}`,
      sourceRef: sourceSessionId ? `session:${sourceSessionId}` : `chat:${record.chatId}`,
    },
    metadata: {
      dedupeKey: normalizeText(record.dedupeKey),
      chatId: record.chatId,
      sourceSessionId,
      kind: record.kind,
      priority: record.priority,
      status: record.status,
      attemptCount: record.attemptCount,
      sentAt: record.sentAt,
      failedAt: record.failedAt,
      errorMessage: normalizeText(record.errorMessage),
    },
  }
}

type SessionActivityStats = {
  sessionId: string
  lastOccurredAt: number
  inboundCount: number
  outboundCount: number
  interactiveContextCount: number
  jobRunSessionCount: number
}

const buildSessionActivityEvidence = (stats: SessionActivityStats): EodEvidenceEntry => {
  return {
    id: `session_activity:${stats.sessionId}`,
    sourceKind: "session_activity",
    sourceId: stats.sessionId,
    signalGroup: "sessions",
    lane: "interactive",
    occurredAt: stats.lastOccurredAt,
    excerpt: `session ${stats.sessionId}: inbound ${stats.inboundCount}, outbound ${stats.outboundCount}, context ${stats.interactiveContextCount}, runs ${stats.jobRunSessionCount}`,
    trace: {
      reference: `session:${stats.sessionId}`,
      sourceRef: stats.sessionId,
    },
    metadata: {
      sourceSessionId: stats.sessionId,
      inboundCount: stats.inboundCount,
      outboundCount: stats.outboundCount,
      interactiveContextCount: stats.interactiveContextCount,
      jobRunSessionCount: stats.jobRunSessionCount,
    },
  }
}

const compareByTimestampDesc = <T extends { timestamp: number; id: string }>(
  left: T,
  right: T
): number => {
  if (left.timestamp !== right.timestamp) {
    return right.timestamp - left.timestamp
  }

  return right.id.localeCompare(left.id)
}

const resolveCappedInboundMessages = (
  records: InboundMessageWindowRecord[]
): InboundMessageWindowRecord[] => {
  const usageBySession = new Map<string, number>()
  return records
    .map((record) => ({ record, timestamp: record.receivedAt, id: record.id }))
    .sort(compareByTimestampDesc)
    .flatMap(({ record }) => {
      const sessionKey = record.sessionId ?? `chat:${record.chatId}`
      const usage = usageBySession.get(sessionKey) ?? 0
      if (usage >= MAX_INBOUND_PER_SESSION) {
        return []
      }

      usageBySession.set(sessionKey, usage + 1)
      return [record]
    })
}

const resolveCappedOutboundMessages = (
  records: Array<OutboundMessageWindowRecord & { sourceSessionId: string | null }>
): Array<OutboundMessageWindowRecord & { sourceSessionId: string | null }> => {
  const usageBySession = new Map<string, number>()
  return records
    .map((record) => ({ record, timestamp: record.createdAt, id: record.id }))
    .sort(compareByTimestampDesc)
    .flatMap(({ record }) => {
      const sessionKey = record.sourceSessionId ?? `chat:${record.chatId}`
      const usage = usageBySession.get(sessionKey) ?? 0
      if (usage >= MAX_OUTBOUND_PER_SESSION) {
        return []
      }

      usageBySession.set(sessionKey, usage + 1)
      return [record]
    })
}

const buildSessionActivityStats = (input: {
  inboundMessages: InboundMessageWindowRecord[]
  outboundMessages: Array<OutboundMessageWindowRecord & { sourceSessionId: string | null }>
  interactiveContextEvents: InteractiveContextEventRecord[]
  jobRunSessions: JobRunSessionWindowRecord[]
}): SessionActivityStats[] => {
  const statsBySession = new Map<string, SessionActivityStats>()

  const upsert = (sessionId: string, occurredAt: number): SessionActivityStats => {
    const existing = statsBySession.get(sessionId)
    if (existing) {
      if (occurredAt > existing.lastOccurredAt) {
        existing.lastOccurredAt = occurredAt
      }
      return existing
    }

    const created: SessionActivityStats = {
      sessionId,
      lastOccurredAt: occurredAt,
      inboundCount: 0,
      outboundCount: 0,
      interactiveContextCount: 0,
      jobRunSessionCount: 0,
    }
    statsBySession.set(sessionId, created)
    return created
  }

  for (const record of input.inboundMessages) {
    if (!record.sessionId) {
      continue
    }
    const stats = upsert(record.sessionId, record.receivedAt)
    stats.inboundCount += 1
  }

  for (const record of input.outboundMessages) {
    if (!record.sourceSessionId) {
      continue
    }
    const stats = upsert(record.sourceSessionId, record.createdAt)
    stats.outboundCount += 1
  }

  for (const record of input.interactiveContextEvents) {
    const stats = upsert(record.sourceSessionId, record.createdAt)
    stats.interactiveContextCount += 1
  }

  for (const record of input.jobRunSessions) {
    const stats = upsert(record.sessionId, record.runStartedAt)
    stats.jobRunSessionCount += 1
  }

  return Array.from(statsBySession.values()).sort((left, right) => {
    if (left.lastOccurredAt !== right.lastOccurredAt) {
      return right.lastOccurredAt - left.lastOccurredAt
    }
    return left.sessionId.localeCompare(right.sessionId)
  })
}

const sortEvidenceEntries = (left: EodEvidenceEntry, right: EodEvidenceEntry): number => {
  if (left.occurredAt !== right.occurredAt) {
    return right.occurredAt - left.occurredAt
  }

  const sourceKindCompare = left.sourceKind.localeCompare(right.sourceKind)
  if (sourceKindCompare !== 0) {
    return sourceKindCompare
  }

  return left.sourceId.localeCompare(right.sourceId)
}

const dedupeEvidenceEntries = (entries: EodEvidenceEntry[]): EodEvidenceEntry[] => {
  const deduped = new Map<string, EodEvidenceEntry>()

  for (const entry of entries.sort(sortEvidenceEntries)) {
    const dedupeKey = `${entry.sourceKind}:${entry.sourceId}`
    if (!deduped.has(dedupeKey)) {
      deduped.set(dedupeKey, entry)
    }
  }

  return Array.from(deduped.values())
}

const summarizeSignalGroups = (entries: EodEvidenceEntry[]): EodEvidenceSignalGroup[] => {
  const grouped = new Map<string, EodEvidenceEntry[]>()

  for (const entry of entries) {
    const bucket = grouped.get(entry.signalGroup)
    if (bucket) {
      bucket.push(entry)
      continue
    }

    grouped.set(entry.signalGroup, [entry])
  }

  return Array.from(grouped.entries())
    .sort(([leftGroup], [rightGroup]) => leftGroup.localeCompare(rightGroup))
    .map(([, groupEntries]) => {
      const sourceKindCounts: Record<string, number> = {}
      for (const entry of groupEntries) {
        sourceKindCounts[entry.sourceKind] = (sourceKindCounts[entry.sourceKind] ?? 0) + 1
      }

      return {
        signalGroup: groupEntries[0].signalGroup,
        evidenceCount: groupEntries.length,
        evidenceIds: groupEntries.map((entry) => entry.id),
        sourceKindCounts,
      }
    })
}

/**
 * Aggregates task audit, command audit, job-run, and interactive-context streams into one
 * deterministic 24h evidence bundle that downstream EOD decisioning can consume safely.
 *
 * @param input Window bounds and source records for the aggregation pass.
 * @returns Stable evidence bundle with source traceability and signal grouping primitives.
 */
export const aggregateEodEvidenceBundle = (
  input: EodEvidenceAggregationInput
): EodEvidenceBundle => {
  const windowStartedAt = Math.min(input.windowStartedAt, input.windowEndedAt)
  const windowEndedAt = Math.max(input.windowStartedAt, input.windowEndedAt)
  const taskAudit = input.taskAudit ?? []
  const commandAudit = input.commandAudit ?? []
  const jobRuns = input.jobRuns ?? []
  const jobRunSessions = input.jobRunSessions ?? []
  const interactiveContextEvents = input.interactiveContextEvents ?? []
  const inboundMessages = input.inboundMessages ?? []
  const outboundMessages = input.outboundMessages ?? []

  const sessionIdByChatId = new Map<number, string | null>()
  const resolveSessionIdByChatId = (chatId: number): string | null => {
    if (sessionIdByChatId.has(chatId)) {
      return sessionIdByChatId.get(chatId) ?? null
    }

    const resolved = input.resolveSessionIdByChatId?.(chatId) ?? null
    sessionIdByChatId.set(chatId, resolved)
    return resolved
  }

  const outboundMessagesWithSessions = outboundMessages.map((record) => ({
    ...record,
    sourceSessionId: resolveSessionIdByChatId(record.chatId),
  }))
  const cappedInboundMessages = resolveCappedInboundMessages(inboundMessages)
  const cappedOutboundMessages = resolveCappedOutboundMessages(outboundMessagesWithSessions)
  const sessionStats = buildSessionActivityStats({
    inboundMessages,
    outboundMessages: outboundMessagesWithSessions,
    interactiveContextEvents,
    jobRunSessions,
  })

  const normalized = [
    ...taskAudit.map((record) => buildTaskAuditEvidence(record, windowStartedAt, windowEndedAt)),
    ...commandAudit.map((record) =>
      buildCommandAuditEvidence(record, windowStartedAt, windowEndedAt)
    ),
    ...jobRuns.map((record) => buildJobRunEvidence(record, windowStartedAt, windowEndedAt)),
    ...interactiveContextEvents.map((record) =>
      buildInteractiveContextEvidence(record, windowStartedAt, windowEndedAt)
    ),
    ...cappedInboundMessages.map((record) =>
      buildInboundMessageEvidence(record, windowStartedAt, windowEndedAt)
    ),
    ...cappedOutboundMessages.map((record) =>
      buildOutboundMessageEvidence(record, record.sourceSessionId, windowStartedAt, windowEndedAt)
    ),
    ...sessionStats.map((stats) => buildSessionActivityEvidence(stats)),
  ].filter((entry): entry is EodEvidenceEntry => entry !== null)

  const evidence = dedupeEvidenceEntries(normalized)
  const groupedSignals = summarizeSignalGroups(evidence)

  return eodEvidenceBundleSchema.parse({
    windowStartedAt,
    windowEndedAt,
    evidence,
    groupedSignals,
    independentSignalCount: groupedSignals.length,
  })
}
