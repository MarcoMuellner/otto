import type {
  EodLearningItemArtifacts,
  EodLearningRunArtifacts,
} from "../../persistence/repositories.js"

const MAX_HIGHLIGHTS = 3

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

const readCount = (summary: Record<string, unknown>, key: string, fallback: number): number => {
  const value = summary[key]
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.trunc(value)
  }

  return fallback
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
    return `- ${item.item.title} (${item.item.applyStatus}, c=${confidence})`
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

  return [
    `EOD digest (${artifacts.run.status})`,
    `- run: ${artifacts.run.id}`,
    `- candidates: ${candidateCount}`,
    `- outcomes: applied ${appliedCount}, skipped ${skippedCount}, candidate-only ${candidateOnlyCount}, failed ${failedApplyCount}`,
    `- follow-ups: scheduled ${followUpScheduledCount}, skipped ${followUpSkippedCount}, failed ${followUpFailedCount}`,
    ...(highlights.length > 0
      ? ["- highlights:", ...highlights]
      : ["- highlights: none in this window"]),
  ].join("\n")
}
