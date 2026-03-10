import { createHash } from "node:crypto"

import { createTaskMutation, type TaskMutationResult } from "../../api-services/tasks-mutations.js"
import type { EodLearningDecisionItem } from "./decision-engine.js"
import type { EodLearningCandidate, EodLearningFollowUpActionProposal } from "./prompt.js"

const FOLLOW_UP_CONFIDENCE_THRESHOLD = 0.8

type FollowUpTaskMutationDependencies = {
  jobsRepository: Parameters<typeof createTaskMutation>[0]["jobsRepository"]
  taskAuditRepository: Parameters<typeof createTaskMutation>[0]["taskAuditRepository"]
}

export type EodFollowUpSchedulingOutcome = {
  proposal: EodLearningFollowUpActionProposal
  fingerprint: string
  status: "success" | "failed" | "skipped"
  reasonCode:
    | "scheduled"
    | "low_confidence"
    | "policy_gate_not_eligible"
    | "not_reversible"
    | "missing_expected_value"
    | "duplicate_fingerprint"
    | "mutation_error"
  detail: string
  taskId: string | null
  errorMessage: string | null
}

const normalizeFingerprintSegment = (value: string | null | undefined): string => {
  if (!value) {
    return ""
  }

  return value.trim().toLowerCase().replace(/\s+/g, " ")
}

/**
 * Builds a stable fingerprint for one follow-up proposal so adjacent EOD runs can avoid
 * repeatedly scheduling the same autonomous action.
 */
export const buildEodFollowUpFingerprint = (input: {
  candidateTitle: string
  proposalTitle: string
  proposalRationale: string | null
}): string => {
  const normalized = JSON.stringify({
    candidateTitle: normalizeFingerprintSegment(input.candidateTitle),
    proposalTitle: normalizeFingerprintSegment(input.proposalTitle),
    proposalRationale: normalizeFingerprintSegment(input.proposalRationale),
  })

  return createHash("sha256").update(normalized).digest("hex").slice(0, 24)
}

const toMutationErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message
  }

  return "follow-up scheduling failed"
}

const resolveTaskRunAt = (
  proposal: EodLearningFollowUpActionProposal,
  nowTimestamp: number
): number => {
  if (proposal.runAt == null) {
    return nowTimestamp
  }

  if (proposal.runAt >= 1_000_000_000_000) {
    return proposal.runAt > nowTimestamp ? proposal.runAt : nowTimestamp
  }

  if (proposal.runAt >= 1_000_000_000) {
    const runAtFromSeconds = proposal.runAt * 1000
    return runAtFromSeconds > nowTimestamp ? runAtFromSeconds : nowTimestamp
  }

  return nowTimestamp
}

/**
 * Applies reversible follow-up scheduling policy to high-confidence EOD candidates and creates
 * one-shot tasks for accepted proposals via the existing task mutation service.
 */
export const scheduleEodFollowUpActions = (input: {
  runId: string
  itemId: string
  decision: EodLearningDecisionItem
  candidate: EodLearningCandidate
  existingFingerprints: Set<string>
  mutationDependencies: FollowUpTaskMutationDependencies | null
  nowTimestamp: number
}): EodFollowUpSchedulingOutcome[] => {
  const outcomes: EodFollowUpSchedulingOutcome[] = []

  for (const proposal of input.candidate.followUpActions) {
    const fingerprint = buildEodFollowUpFingerprint({
      candidateTitle: input.candidate.title,
      proposalTitle: proposal.title,
      proposalRationale: proposal.rationale,
    })

    if (input.existingFingerprints.has(fingerprint)) {
      outcomes.push({
        proposal,
        fingerprint,
        status: "skipped",
        reasonCode: "duplicate_fingerprint",
        detail: "Duplicate follow-up proposal fingerprint",
        taskId: null,
        errorMessage: null,
      })
      continue
    }

    if (input.decision.confidence < FOLLOW_UP_CONFIDENCE_THRESHOLD) {
      outcomes.push({
        proposal,
        fingerprint,
        status: "skipped",
        reasonCode: "low_confidence",
        detail: "Candidate confidence is below follow-up threshold",
        taskId: null,
        errorMessage: null,
      })
      continue
    }

    if (!input.decision.followUpEligible) {
      outcomes.push({
        proposal,
        fingerprint,
        status: "skipped",
        reasonCode: "policy_gate_not_eligible",
        detail: "Candidate is not eligible for autonomous follow-up",
        taskId: null,
        errorMessage: null,
      })
      continue
    }

    if (!proposal.reversible) {
      outcomes.push({
        proposal,
        fingerprint,
        status: "skipped",
        reasonCode: "not_reversible",
        detail: "Follow-up proposal is not reversible",
        taskId: null,
        errorMessage: null,
      })
      continue
    }

    if (proposal.expectedValue == null) {
      outcomes.push({
        proposal,
        fingerprint,
        status: "skipped",
        reasonCode: "missing_expected_value",
        detail: "Follow-up proposal is missing expected value",
        taskId: null,
        errorMessage: null,
      })
      continue
    }

    if (!input.mutationDependencies) {
      outcomes.push({
        proposal,
        fingerprint,
        status: "failed",
        reasonCode: "mutation_error",
        detail: "Task mutation dependencies unavailable",
        taskId: null,
        errorMessage: "task mutation dependencies unavailable",
      })
      continue
    }

    try {
      const mutation: TaskMutationResult = createTaskMutation(
        {
          jobsRepository: input.mutationDependencies.jobsRepository,
          taskAuditRepository: input.mutationDependencies.taskAuditRepository,
          now: () => input.nowTimestamp,
        },
        {
          type: "general-reminder",
          scheduleType: "oneshot",
          runAt: resolveTaskRunAt(proposal, input.nowTimestamp),
          payload: {
            mode: "eod_follow_up",
            title: proposal.title,
            rationale: proposal.rationale,
            expectedValue: proposal.expectedValue,
            source: {
              runId: input.runId,
              itemId: input.itemId,
              fingerprint,
              candidateTitle: input.candidate.title,
            },
          },
        },
        {
          lane: "scheduled",
          actor: "scheduler_eod_learning",
          source: "internal_api",
        }
      )

      input.existingFingerprints.add(fingerprint)

      outcomes.push({
        proposal,
        fingerprint,
        status: "success",
        reasonCode: "scheduled",
        detail: `Scheduled follow-up task ${mutation.id}`,
        taskId: mutation.id,
        errorMessage: null,
      })
    } catch (error) {
      outcomes.push({
        proposal,
        fingerprint,
        status: "failed",
        reasonCode: "mutation_error",
        detail: "Follow-up task scheduling failed",
        taskId: null,
        errorMessage: toMutationErrorMessage(error),
      })
    }
  }

  return outcomes
}
