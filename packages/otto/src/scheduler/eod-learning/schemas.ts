import { z } from "zod"

export const eodEvidenceSourceKindSchema = z.enum([
  "task_audit",
  "command_audit",
  "job_run",
  "interactive_context",
  "inbound_message",
  "outbound_message",
  "session_activity",
])

export const eodEvidenceSignalGroupSchema = z.enum([
  "tasks",
  "commands",
  "jobs",
  "interactive_context",
  "interactive_messages",
  "sessions",
])

export const eodEvidenceEntrySchema = z.object({
  id: z.string().trim().min(1),
  sourceKind: eodEvidenceSourceKindSchema,
  sourceId: z.string().trim().min(1),
  signalGroup: eodEvidenceSignalGroupSchema,
  lane: z.string().trim().min(1).nullable(),
  occurredAt: z.number().int(),
  excerpt: z.string().trim().min(1).nullable(),
  trace: z.object({
    reference: z.string().trim().min(1),
    sourceRef: z.string().trim().min(1).nullable(),
  }),
  metadata: z.record(z.string(), z.unknown()),
})

export const eodEvidenceSignalGroupSummarySchema = z.object({
  signalGroup: eodEvidenceSignalGroupSchema,
  evidenceCount: z.number().int().min(0),
  evidenceIds: z.array(z.string().trim().min(1)),
  sourceKindCounts: z.record(z.string(), z.number().int().min(0)),
})

export const eodEvidenceBundleSchema = z.object({
  windowStartedAt: z.number().int(),
  windowEndedAt: z.number().int(),
  evidence: z.array(eodEvidenceEntrySchema),
  groupedSignals: z.array(eodEvidenceSignalGroupSummarySchema),
  independentSignalCount: z.number().int().min(0),
})

export type EodEvidenceEntry = z.infer<typeof eodEvidenceEntrySchema>
export type EodEvidenceSignalGroup = z.infer<typeof eodEvidenceSignalGroupSummarySchema>
export type EodEvidenceBundle = z.infer<typeof eodEvidenceBundleSchema>
