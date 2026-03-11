import { z } from "zod"

import type {
  EodLearningItemArtifacts,
  EodLearningRunArtifacts,
} from "../../persistence/repositories.js"

const MAX_HIGHLIGHTS = 3
const MAX_SCHEDULED_FOLLOW_UPS = 3
const DETAIL_TRIM_LENGTH = 120

export const eodDigestMessageSchema = z.object({
  message: z.string().trim().min(1),
})

export type EodDigestMessageParseOutcome = {
  message: string | null
  rawOutput: string | null
  parseErrorCode: string | null
  parseErrorMessage: string | null
}

const parseSummary = (summaryJson: string | null): Record<string, unknown> => {
  if (!summaryJson) {
    return {}
  }

  try {
    const parsed = JSON.parse(summaryJson)
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    return {}
  }

  return {}
}

const parseJsonObject = (assistantText: string): unknown => {
  const trimmed = assistantText.trim()
  if (trimmed.length === 0) {
    throw new Error("empty_output")
  }

  try {
    return JSON.parse(trimmed)
  } catch {
    const fencedMatch = trimmed.match(/```json\s*([\s\S]*?)\s*```/i)
    if (!fencedMatch?.[1]) {
      throw new Error("invalid_json")
    }

    return JSON.parse(fencedMatch[1])
  }
}

const parseJsonRecord = (rawJson: string | null): Record<string, unknown> => {
  if (!rawJson) {
    return {}
  }

  try {
    const parsed = JSON.parse(rawJson)
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    return {}
  }

  return {}
}

const readCount = (summary: Record<string, unknown>, key: string, fallback: number): number => {
  const value = summary[key]
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.trunc(value)
  }

  return fallback
}

const readString = (record: Record<string, unknown>, key: string): string | null => {
  const value = record[key]
  if (typeof value === "string") {
    const normalized = value.trim()
    return normalized.length > 0 ? normalized : null
  }

  return null
}

const trimDetail = (value: string | null): string | null => {
  if (!value) {
    return null
  }

  const normalized = value.trim().replace(/\s+/g, " ")
  if (normalized.length <= DETAIL_TRIM_LENGTH) {
    return normalized
  }

  return `${normalized.slice(0, DETAIL_TRIM_LENGTH - 1)}...`
}

const resolveSkippedReasonLabel = (item: EodLearningItemArtifacts): string => {
  const metadata = parseJsonRecord(item.item.metadataJson)
  const policyReason = readString(metadata, "policyReason")

  if (policyReason === "contradiction_detected") {
    return "conflicting evidence"
  }

  if (policyReason === "insufficient_independent_signals") {
    return "insufficient independent signals"
  }

  const primaryAction = item.actions[0]
  if (primaryAction?.actionType === "memory_replace" && primaryAction.status === "skipped") {
    const detail = trimDetail(primaryAction.detail)
    return detail ? `not persisted: ${detail}` : "not persisted"
  }

  if (policyReason === "high_confidence") {
    return "high confidence, but no durable update"
  }

  if (policyReason === "medium_confidence") {
    return "medium confidence, kept as observation"
  }

  return "skipped by policy"
}

const resolveOutcomeLabel = (item: EodLearningItemArtifacts): string => {
  if (item.item.applyStatus === "applied") {
    return "applied"
  }

  if (item.item.applyStatus === "failed") {
    return "apply failed"
  }

  if (item.item.applyStatus === "candidate_only") {
    return "candidate only"
  }

  return resolveSkippedReasonLabel(item)
}

const extractScheduledFollowUps = (items: EodLearningItemArtifacts[]): string[] => {
  const proposals: string[] = []

  for (const item of items) {
    for (const action of item.actions) {
      if (action.actionType !== "follow_up_schedule" || action.status !== "success") {
        continue
      }

      const metadata = parseJsonRecord(action.metadataJson)
      const proposalTitle = readString(metadata, "proposalTitle")
      proposals.push(proposalTitle ?? action.detail ?? "scheduled follow-up")
    }
  }

  return proposals.slice(0, MAX_SCHEDULED_FOLLOW_UPS).map((proposal) => `  - ${proposal}`)
}

const countSkippedReasons = (items: EodLearningItemArtifacts[]): {
  contradiction: number
  noDurableUpdate: number
  other: number
} => {
  let contradiction = 0
  let noDurableUpdate = 0
  let other = 0

  for (const item of items) {
    if (item.item.applyStatus !== "skipped") {
      continue
    }

    const metadata = parseJsonRecord(item.item.metadataJson)
    const policyReason = readString(metadata, "policyReason")
    if (policyReason === "contradiction_detected") {
      contradiction += 1
      continue
    }

    if (item.actions[0]?.actionType === "memory_replace" && item.actions[0]?.status === "skipped") {
      noDurableUpdate += 1
      continue
    }

    other += 1
  }

  return {
    contradiction,
    noDurableUpdate,
    other,
  }
}

const normalizeActionForLlm = (action: EodLearningItemArtifacts["actions"][number]) => {
  const metadata = parseJsonRecord(action.metadataJson)
  return {
    actionType: action.actionType,
    status: action.status,
    detail: trimDetail(action.detail),
    errorMessage: trimDetail(action.errorMessage),
    reasonCode: readString(metadata, "reasonCode"),
    proposalTitle: readString(metadata, "proposalTitle"),
    taskId: readString(metadata, "taskId"),
  }
}

const toDigestInput = (artifacts: EodLearningRunArtifacts) => {
  const summary = parseSummary(artifacts.run.summaryJson)
  const items = artifacts.items

  const appliedCount = items.filter((item) => item.item.applyStatus === "applied").length
  const skippedCount = items.filter((item) => item.item.applyStatus === "skipped").length
  const candidateOnlyCount = items.filter(
    (item) => item.item.applyStatus === "candidate_only"
  ).length
  const failedApplyCount = items.filter((item) => item.item.applyStatus === "failed").length
  const followUpScheduledCount = readCount(summary, "followUpScheduledCount", 0)
  const followUpSkippedCount = readCount(summary, "followUpSkippedCount", 0)
  const followUpFailedCount = readCount(summary, "followUpFailedCount", 0)
  const candidateCount = readCount(summary, "candidateCount", items.length)

  return {
    run: {
      id: artifacts.run.id,
      status: artifacts.run.status,
      windowStartedAt: artifacts.run.windowStartedAt,
      windowEndedAt: artifacts.run.windowEndedAt,
    },
    counts: {
      candidates: candidateCount,
      applied: appliedCount,
      skipped: skippedCount,
      candidateOnly: candidateOnlyCount,
      failed: failedApplyCount,
      followUpScheduled: followUpScheduledCount,
      followUpSkipped: followUpSkippedCount,
      followUpFailed: followUpFailedCount,
      skippedBreakdown: countSkippedReasons(items),
    },
    items: items.map((item) => {
      const metadata = parseJsonRecord(item.item.metadataJson)
      return {
        title: item.item.title,
        confidence: item.item.confidence,
        decision: item.item.decision,
        applyStatus: item.item.applyStatus,
        applyError: trimDetail(item.item.applyError),
        policyReason: readString(metadata, "policyReason"),
        followUpEligible: metadata.followUpEligible === true,
        actions: item.actions.map(normalizeActionForLlm),
      }
    }),
  }
}

/**
 * Builds the structured prompt used to let the model produce the final human-facing EOD digest
 * in the user's language from normalized run artifacts.
 */
export const buildEodLearningDigestInterpretationPrompt = (
  artifacts: EodLearningRunArtifacts
): string => {
  return [
    "You are generating a concise End-of-Day learning digest message for a human operator.",
    "",
    "Return ONLY valid JSON with this exact shape:",
    '{"message":"<digest text>"}',
    "",
    "Rules for message:",
    "- Write in the same language the user appears to use in this run data. If unclear, use English.",
    "- Be clear and practical, not robotic.",
    "- Explain what changed and what did not change.",
    "- Include: outcomes, why items were skipped, and scheduled follow-ups (if any).",
    "- Keep it compact (around 8-14 lines).",
    "- No markdown code fences.",
    "",
    "Run data:",
    JSON.stringify(toDigestInput(artifacts)),
  ].join("\n")
}

/**
 * Parses the model-produced EOD digest payload and returns a structured parse result so callers
 * can safely fall back to deterministic formatting when the model output is invalid.
 */
export const parseEodLearningDigestMessage = (assistantText: string): EodDigestMessageParseOutcome => {
  const trimmed = assistantText.trim()
  if (trimmed.length === 0) {
    return {
      message: null,
      rawOutput: null,
      parseErrorCode: "invalid_eod_digest_json",
      parseErrorMessage: "EOD digest output returned empty output",
    }
  }

  const validateParsedMessage = (parsed: unknown): EodDigestMessageParseOutcome => {
    const validated = eodDigestMessageSchema.safeParse(parsed)
    if (!validated.success) {
      return {
        message: null,
        rawOutput: trimmed,
        parseErrorCode: "invalid_eod_digest_schema",
        parseErrorMessage: validated.error.message,
      }
    }

    return {
      message: validated.data.message,
      rawOutput: null,
      parseErrorCode: null,
      parseErrorMessage: null,
    }
  }

  try {
    return validateParsedMessage(parseJsonObject(trimmed))
  } catch {
    return {
      message: null,
      rawOutput: trimmed,
      parseErrorCode: "invalid_eod_digest_json",
      parseErrorMessage: "EOD digest output must be valid JSON",
    }
  }
}

const resolveHighlights = (items: EodLearningItemArtifacts[]): string[] => {
  const prioritizedItems = [...items].sort((left, right) => {
    const leftPriority =
      left.item.applyStatus === "applied" ? 2 : left.item.applyStatus === "failed" ? 1 : 0
    const rightPriority =
      right.item.applyStatus === "applied" ? 2 : right.item.applyStatus === "failed" ? 1 : 0
    if (leftPriority !== rightPriority) {
      return rightPriority - leftPriority
    }

    return right.item.confidence - left.item.confidence
  })

  return prioritizedItems.slice(0, MAX_HIGHLIGHTS).map((item) => {
    const confidence = item.item.confidence.toFixed(2)
    return `  - ${item.item.title} -> ${resolveOutcomeLabel(item)} (c=${confidence})`
  })
}

/**
 * Formats a concise Telegram-safe EOD transparency digest so nightly learning outcomes remain
 * traceable without exposing raw evidence payloads.
 *
 * @param artifacts Persisted EOD run artifacts for a single run id.
 * @returns Compact digest message suitable for Telegram queue delivery.
 */
export const buildEodLearningDigestMessage = (artifacts: EodLearningRunArtifacts): string => {
  const summary = parseSummary(artifacts.run.summaryJson)
  const items = artifacts.items

  const appliedCount = items.filter((item) => item.item.applyStatus === "applied").length
  const skippedCount = items.filter((item) => item.item.applyStatus === "skipped").length
  const candidateOnlyCount = items.filter(
    (item) => item.item.applyStatus === "candidate_only"
  ).length
  const failedApplyCount = items.filter((item) => item.item.applyStatus === "failed").length

  const followUpScheduledCount = readCount(summary, "followUpScheduledCount", 0)
  const followUpSkippedCount = readCount(summary, "followUpSkippedCount", 0)
  const followUpFailedCount = readCount(summary, "followUpFailedCount", 0)
  const candidateCount = readCount(summary, "candidateCount", items.length)

  const highlights = resolveHighlights(items)
  const followUpTitles = extractScheduledFollowUps(items)
  const skippedReasonCounts = countSkippedReasons(items)

  return [
    `EOD learning run ${artifacts.run.id} (${artifacts.run.status})`,
    `Reviewed ${candidateCount} candidates: ${appliedCount} applied, ${skippedCount} skipped, ${candidateOnlyCount} candidate-only, ${failedApplyCount} failed.`,
    ...(skippedCount > 0
      ? [
          `Skipped breakdown: ${skippedReasonCounts.contradiction} conflicting evidence, ${skippedReasonCounts.noDurableUpdate} not durable/duplicate, ${skippedReasonCounts.other} other policy gates.`,
        ]
      : []),
    `Follow-ups: ${followUpScheduledCount} scheduled, ${followUpSkippedCount} skipped, ${followUpFailedCount} failed.`,
    ...(followUpTitles.length > 0 ? ["Scheduled follow-ups:", ...followUpTitles] : []),
    ...(highlights.length > 0 ? ["Key findings:", ...highlights] : ["Key findings: none in this window."]),
  ].join("\n")
}
