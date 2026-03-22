import { z } from "zod"

import type { EodEvidenceBundle, EodEvidenceEntry } from "./schemas.js"

const EOD_MAX_CANDIDATES = 10

export const eodLearningCandidateSchema = z.object({
  title: z.string().trim().min(1),
  candidateKind: z.enum(["general", "user_preference"]).optional().default("general"),
  confidence: z.number().min(0).max(1),
  contradiction: z.boolean().optional().default(false),
  expectedValue: z.number().finite().nullable().optional().default(null),
  evidenceIds: z.array(z.string().trim().min(1)).optional().default([]),
  rationale: z.string().trim().min(1).nullable().optional().default(null),
  followUpActions: z
    .array(
      z.object({
        title: z.string().trim().min(1),
        rationale: z.string().trim().min(1).nullable().optional().default(null),
        reversible: z.boolean().optional().default(false),
        expectedValue: z.number().finite().nullable().optional().default(null),
        runAt: z.number().int().nullable().optional().default(null),
      })
    )
    .optional()
    .default([]),
})

export const eodLearningCandidateOutputSchema = z.object({
  candidates: z.array(eodLearningCandidateSchema).max(EOD_MAX_CANDIDATES).default([]),
})

export const eodLearningApplyActionSchema = z.object({
  actionType: z.string().trim().min(1),
  status: z.enum(["success", "failed", "skipped"]),
  detail: z.string().trim().min(1).nullable().optional().default(null),
  errorMessage: z.string().trim().min(1).nullable().optional().default(null),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
})

export const eodLearningApplyOutputSchema = z.object({
  status: z.enum(["success", "failed", "skipped"]),
  summary: z.string().trim().min(1),
  actions: z.array(eodLearningApplyActionSchema).default([]),
})

export type EodLearningCandidate = z.infer<typeof eodLearningCandidateSchema>
export type EodLearningFollowUpActionProposal = EodLearningCandidate["followUpActions"][number]
export type EodLearningCandidateOutput = z.infer<typeof eodLearningCandidateOutputSchema>
export type EodLearningApplyOutput = z.infer<typeof eodLearningApplyOutputSchema>

const mapEvidenceForPrompt = (entry: EodEvidenceEntry) => {
  return {
    id: entry.id,
    sourceKind: entry.sourceKind,
    signalGroup: entry.signalGroup,
    occurredAt: entry.occurredAt,
    excerpt: entry.excerpt,
    traceReference: entry.trace.reference,
  }
}

/**
 * Builds the model contract for candidate extraction from already-aggregated EOD evidence.
 *
 * @param input EOD evidence bundle and run window context.
 * @returns Prompt text with strict JSON output rules.
 */
export const buildEodLearningCandidatePrompt = (input: {
  runId: string
  windowStartedAt: number
  windowEndedAt: number
  evidenceBundle: EodEvidenceBundle
}): string => {
  return [
    "You are running Otto's nightly EOD learning candidate extraction.",
    "Read the evidence bundle and propose compact learning candidates.",
    "Return ONLY valid JSON with this exact shape:",
    '{"candidates":[{"title":"...","confidence":0.0,"contradiction":false,"expectedValue":0.0,"evidenceIds":["..."],"rationale":"...","followUpActions":[{"title":"...","rationale":"...","reversible":true,"expectedValue":0.0,"runAt":null}]}]}',
    "Rules:",
    `- Maximum ${EOD_MAX_CANDIDATES} candidates.`,
    '- candidateKind must be "user_preference" only when the evidence contains an explicit user preference, instruction, or correction stated by the user; otherwise use "general".',
    "- confidence must be between 0 and 1.",
    "- contradiction must be true when signals materially conflict.",
    "- evidenceIds must reference only ids from the provided evidence list.",
    "- followUpActions must include only reversible, concrete tasks when proposing autonomous follow-up work.",
    "- Every follow-up action must include reversible and expectedValue fields.",
    "- followUpActions.runAt must be Unix epoch milliseconds when provided (not seconds).",
    "- No markdown, prose, or extra keys outside the schema.",
    "",
    "Run context:",
    JSON.stringify(
      {
        runId: input.runId,
        windowStartedAt: input.windowStartedAt,
        windowEndedAt: input.windowEndedAt,
        groupedSignals: input.evidenceBundle.groupedSignals,
        independentSignalCount: input.evidenceBundle.independentSignalCount,
      },
      null,
      2
    ),
    "",
    "Evidence list:",
    JSON.stringify(input.evidenceBundle.evidence.map(mapEvidenceForPrompt), null, 2),
  ].join("\n")
}

/**
 * Builds the model contract for applying one policy-approved candidate to memory/journal.
 *
 * @param input Candidate and supporting evidence selected by deterministic policy.
 * @returns Prompt text that requires a strict machine-readable apply report.
 */
export const buildEodLearningApplyPrompt = (input: {
  runId: string
  itemId: string
  candidate: EodLearningCandidate
  evidence: EodEvidenceEntry[]
}): string => {
  return [
    "You are applying one approved EOD learning item for Otto.",
    "Use available tools to apply memory/journal changes only if they are precise and justified.",
    "Return ONLY valid JSON with this exact shape:",
    '{"status":"success|failed|skipped","summary":"...","actions":[{"actionType":"memory_set|memory_replace|set_journal_tags","status":"success|failed|skipped","detail":"...","errorMessage":null,"metadata":{}}]}',
    "Rules:",
    "- If evidence is insufficient, set status=skipped.",
    "- Include one action row per attempted operation.",
    "- No markdown or extra top-level keys.",
    "",
    "Candidate:",
    JSON.stringify(
      {
        runId: input.runId,
        itemId: input.itemId,
        title: input.candidate.title,
        confidence: input.candidate.confidence,
        expectedValue: input.candidate.expectedValue,
        rationale: input.candidate.rationale,
      },
      null,
      2
    ),
    "",
    "Supporting evidence:",
    JSON.stringify(input.evidence.map(mapEvidenceForPrompt), null, 2),
  ].join("\n")
}
