import type { EodEvidenceBundle } from "./schemas.js"
import type { EodLearningCandidate } from "./prompt.js"

const HIGH_CONFIDENCE_THRESHOLD = 0.8
const MEDIUM_CONFIDENCE_THRESHOLD = 0.6
const MIN_INDEPENDENT_SIGNALS = 2
const MIN_USER_PREFERENCE_SIGNALS = 1

export type EodDecision =
  | "auto_apply_memory_journal_high_confidence"
  | "auto_apply_memory_journal"
  | "candidate_only_low_confidence"
  | "skipped_contradiction"
  | "skipped_insufficient_signals"

export type EodLearningDecisionItem = {
  ordinal: number
  title: string
  confidence: number
  contradiction: boolean
  expectedValue: number | null
  decision: EodDecision
  applyEligible: boolean
  followUpEligible: boolean
  policyReason: string
  referencedEvidenceIds: string[]
  independentSignals: string[]
}

const toUnique = <T>(values: T[]): T[] => {
  return [...new Set(values)]
}

/**
 * Applies deterministic EOD policy gates to model-proposed learning candidates so confidence
 * and contradiction handling remain stable across runs.
 *
 * @param input Candidates plus aggregated evidence bundle for signal validation.
 * @returns Policy-evaluated candidate decisions in original candidate order.
 */
export const evaluateEodLearningDecisions = (input: {
  candidates: EodLearningCandidate[]
  evidenceBundle: EodEvidenceBundle
}): EodLearningDecisionItem[] => {
  const evidenceById = new Map(input.evidenceBundle.evidence.map((entry) => [entry.id, entry]))

  return input.candidates.map((candidate, index) => {
    const referencedEvidenceIds = toUnique(
      candidate.evidenceIds.filter((evidenceId) => evidenceById.has(evidenceId))
    )

    const independentSignals = toUnique(
      referencedEvidenceIds
        .map((evidenceId) => evidenceById.get(evidenceId)?.signalGroup)
        .filter(
          (signalGroup): signalGroup is NonNullable<typeof signalGroup> => signalGroup != null
        )
    )

    const hasDirectUserSignal = referencedEvidenceIds.some(
      (evidenceId) => evidenceById.get(evidenceId)?.sourceKind === "inbound_message"
    )
    const isUserPreferenceCandidate = candidate.candidateKind === "user_preference"
    const minSignalRequirement =
      isUserPreferenceCandidate && hasDirectUserSignal
        ? MIN_USER_PREFERENCE_SIGNALS
        : MIN_INDEPENDENT_SIGNALS

    const hasIndependentSignals = independentSignals.length >= minSignalRequirement
    const contradiction = candidate.contradiction

    if (contradiction) {
      return {
        ordinal: index,
        title: candidate.title,
        confidence: candidate.confidence,
        contradiction,
        expectedValue: candidate.expectedValue,
        decision: "skipped_contradiction",
        applyEligible: false,
        followUpEligible: false,
        policyReason: "contradiction_detected",
        referencedEvidenceIds,
        independentSignals,
      }
    }

    if (!hasIndependentSignals) {
      return {
        ordinal: index,
        title: candidate.title,
        confidence: candidate.confidence,
        contradiction,
        expectedValue: candidate.expectedValue,
        decision: "skipped_insufficient_signals",
        applyEligible: false,
        followUpEligible: false,
        policyReason: "insufficient_independent_signals",
        referencedEvidenceIds,
        independentSignals,
      }
    }

    if (candidate.confidence >= HIGH_CONFIDENCE_THRESHOLD) {
      return {
        ordinal: index,
        title: candidate.title,
        confidence: candidate.confidence,
        contradiction,
        expectedValue: candidate.expectedValue,
        decision: "auto_apply_memory_journal_high_confidence",
        applyEligible: true,
        followUpEligible: true,
        policyReason: "high_confidence",
        referencedEvidenceIds,
        independentSignals,
      }
    }

    if (candidate.confidence >= MEDIUM_CONFIDENCE_THRESHOLD) {
      return {
        ordinal: index,
        title: candidate.title,
        confidence: candidate.confidence,
        contradiction,
        expectedValue: candidate.expectedValue,
        decision: "auto_apply_memory_journal",
        applyEligible: true,
        followUpEligible: false,
        policyReason: "medium_confidence",
        referencedEvidenceIds,
        independentSignals,
      }
    }

    return {
      ordinal: index,
      title: candidate.title,
      confidence: candidate.confidence,
      contradiction,
      expectedValue: candidate.expectedValue,
      decision: "candidate_only_low_confidence",
      applyEligible: false,
      followUpEligible: false,
      policyReason: "low_confidence",
      referencedEvidenceIds,
      independentSignals,
    }
  })
}
