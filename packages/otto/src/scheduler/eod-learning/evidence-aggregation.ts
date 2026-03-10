import type {
  CommandAuditRecord,
  InteractiveContextEventRecord,
  JobRunSummaryRecord,
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
  taskAudit: TaskAuditRecord[]
  commandAudit: CommandAuditRecord[]
  jobRuns: JobRunSummaryRecord[]
  interactiveContextEvents: InteractiveContextEventRecord[]
}

const normalizeText = (value: string | null | undefined): string | null => {
  if (typeof value !== "string") {
    return null
  }

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
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

  const normalized = [
    ...input.taskAudit.map((record) =>
      buildTaskAuditEvidence(record, windowStartedAt, windowEndedAt)
    ),
    ...input.commandAudit.map((record) =>
      buildCommandAuditEvidence(record, windowStartedAt, windowEndedAt)
    ),
    ...input.jobRuns.map((record) => buildJobRunEvidence(record, windowStartedAt, windowEndedAt)),
    ...input.interactiveContextEvents.map((record) =>
      buildInteractiveContextEvidence(record, windowStartedAt, windowEndedAt)
    ),
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
