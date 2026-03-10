import { describe, expect, it } from "vitest"

import type { EodLearningDecisionItem } from "../../src/scheduler/eod-learning/decision-engine.js"
import {
  buildEodFollowUpFingerprint,
  scheduleEodFollowUpActions,
} from "../../src/scheduler/eod-learning/follow-up-actions.js"
import type { EodLearningCandidate } from "../../src/scheduler/eod-learning/prompt.js"

const createDecision = (overrides?: Partial<EodLearningDecisionItem>): EodLearningDecisionItem => {
  return {
    ordinal: 0,
    title: "Improve reminder clarity",
    confidence: 0.9,
    contradiction: false,
    expectedValue: 0.4,
    decision: "auto_apply_memory_journal_high_confidence",
    applyEligible: true,
    followUpEligible: true,
    policyReason: "high_confidence",
    referencedEvidenceIds: ["task_audit:t1", "command_audit:c1"],
    independentSignals: ["tasks", "commands"],
    ...overrides,
  }
}

const createCandidate = (overrides?: Partial<EodLearningCandidate>): EodLearningCandidate => {
  return {
    title: "Improve reminder clarity",
    confidence: 0.9,
    contradiction: false,
    expectedValue: 0.4,
    evidenceIds: ["task_audit:t1", "command_audit:c1"],
    rationale: "Signal quality is high",
    followUpActions: [
      {
        title: "Schedule reminder-tone regression review",
        rationale: "Verify phrasing acceptance after two days",
        reversible: true,
        expectedValue: 0.3,
        runAt: null,
      },
    ],
    ...overrides,
  }
}

describe("eod-learning follow-up scheduling", () => {
  it("schedules reversible high-confidence follow-up proposals", () => {
    // Arrange
    const taskStore = new Map<string, { payload: string | null }>()
    const auditRows: unknown[] = []
    const candidate = createCandidate()
    const decision = createDecision()
    const fingerprints = new Set<string>()

    // Act
    const outcomes = scheduleEodFollowUpActions({
      runId: "run-1",
      itemId: "item-1",
      decision,
      candidate,
      existingFingerprints: fingerprints,
      mutationDependencies: {
        jobsRepository: {
          getById: () => null,
          createTask: (record) => {
            taskStore.set(record.id, { payload: record.payload })
          },
          updateTask: () => {},
          cancelTask: () => {},
          runTaskNow: () => {},
        },
        taskAuditRepository: {
          insert: (record) => {
            auditRows.push(record)
          },
        },
      },
      nowTimestamp: 10_000,
    })

    // Assert
    expect(outcomes).toHaveLength(1)
    expect(outcomes[0]?.status).toBe("success")
    expect(outcomes[0]?.reasonCode).toBe("scheduled")
    expect(outcomes[0]?.taskId).toBeTruthy()
    expect(auditRows).toHaveLength(1)

    const createdPayload = Array.from(taskStore.values())[0]?.payload
    expect(createdPayload).toContain("eod_follow_up")
    expect(createdPayload).toContain("run-1")
    expect(createdPayload).toContain("item-1")
  })

  it("rejects follow-up proposals that fail reversible and expected-value policy", () => {
    // Arrange
    const candidate = createCandidate({
      followUpActions: [
        {
          title: "Non-reversible action",
          rationale: "Mutates system defaults irreversibly",
          reversible: false,
          expectedValue: 0.8,
          runAt: null,
        },
        {
          title: "Missing expected value",
          rationale: "No value estimate",
          reversible: true,
          expectedValue: null,
          runAt: null,
        },
      ],
    })

    // Act
    const outcomes = scheduleEodFollowUpActions({
      runId: "run-2",
      itemId: "item-2",
      decision: createDecision(),
      candidate,
      existingFingerprints: new Set<string>(),
      mutationDependencies: null,
      nowTimestamp: 20_000,
    })

    // Assert
    expect(outcomes.map((entry) => entry.reasonCode)).toEqual([
      "not_reversible",
      "missing_expected_value",
    ])
    expect(outcomes.map((entry) => entry.status)).toEqual(["skipped", "skipped"])
  })

  it("dedupes proposals against previous fingerprints and within the same run", () => {
    // Arrange
    const proposal = {
      title: "Schedule reminder-tone regression review",
      rationale: "Verify phrasing acceptance after two days",
      reversible: true,
      expectedValue: 0.3,
      runAt: null,
    }
    const candidate = createCandidate({
      followUpActions: [proposal, proposal],
    })
    const existingFingerprints = new Set<string>([
      buildEodFollowUpFingerprint({
        candidateTitle: candidate.title,
        proposalTitle: proposal.title,
        proposalRationale: proposal.rationale,
      }),
    ])

    // Act
    const outcomes = scheduleEodFollowUpActions({
      runId: "run-3",
      itemId: "item-3",
      decision: createDecision(),
      candidate,
      existingFingerprints,
      mutationDependencies: null,
      nowTimestamp: 30_000,
    })

    // Assert
    expect(outcomes).toHaveLength(2)
    expect(outcomes[0]?.reasonCode).toBe("duplicate_fingerprint")
    expect(outcomes[1]?.reasonCode).toBe("duplicate_fingerprint")
    expect(outcomes.map((entry) => entry.status)).toEqual(["skipped", "skipped"])
  })

  it("allows retry in the same run after a scheduling failure", () => {
    // Arrange
    const candidate = createCandidate({
      followUpActions: [
        {
          title: "Retryable proposal",
          rationale: "First attempt fails",
          reversible: true,
          expectedValue: 0.4,
          runAt: null,
        },
        {
          title: "Retryable proposal",
          rationale: "First attempt fails",
          reversible: true,
          expectedValue: 0.4,
          runAt: null,
        },
      ],
    })

    let createAttempts = 0

    // Act
    const outcomes = scheduleEodFollowUpActions({
      runId: "run-4",
      itemId: "item-4",
      decision: createDecision(),
      candidate,
      existingFingerprints: new Set<string>(),
      mutationDependencies: {
        jobsRepository: {
          getById: () => null,
          createTask: () => {
            createAttempts += 1
            if (createAttempts === 1) {
              throw new Error("transient create failure")
            }
          },
          updateTask: () => {},
          cancelTask: () => {},
          runTaskNow: () => {},
        },
        taskAuditRepository: {
          insert: () => {},
        },
      },
      nowTimestamp: 40_000,
    })

    // Assert
    expect(outcomes).toHaveLength(2)
    expect(outcomes[0]?.status).toBe("failed")
    expect(outcomes[0]?.reasonCode).toBe("mutation_error")
    expect(outcomes[1]?.status).toBe("success")
    expect(outcomes[1]?.reasonCode).toBe("scheduled")
  })

  it("converts second-scale runAt into milliseconds", () => {
    // Arrange
    const runAtInSeconds = 4_000_000_000
    const nowTimestamp = 3_000_000_000
    let capturedRunAt: number | null = null

    // Act
    const outcomes = scheduleEodFollowUpActions({
      runId: "run-5",
      itemId: "item-5",
      decision: createDecision(),
      candidate: createCandidate({
        followUpActions: [
          {
            title: "Future follow-up",
            rationale: "Use second-scale timestamp",
            reversible: true,
            expectedValue: 0.5,
            runAt: runAtInSeconds,
          },
        ],
      }),
      existingFingerprints: new Set<string>(),
      mutationDependencies: {
        jobsRepository: {
          getById: () => null,
          createTask: (record) => {
            capturedRunAt = record.runAt
          },
          updateTask: () => {},
          cancelTask: () => {},
          runTaskNow: () => {},
        },
        taskAuditRepository: {
          insert: () => {},
        },
      },
      nowTimestamp,
    })

    // Assert
    expect(outcomes[0]?.status).toBe("success")
    expect(capturedRunAt).toBe(runAtInSeconds * 1000)
  })
})
