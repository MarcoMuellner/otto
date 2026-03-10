import { describe, expect, it } from "vitest"

import { evaluateEodLearningDecisions } from "../../src/scheduler/eod-learning/decision-engine.js"

describe("eod-learning decision engine", () => {
  it("skips apply when fewer than two independent signals support a candidate", () => {
    // Arrange
    const evidenceBundle = {
      windowStartedAt: 1_000,
      windowEndedAt: 2_000,
      evidence: [
        {
          id: "e1",
          sourceKind: "task_audit",
          sourceId: "t1",
          signalGroup: "tasks",
          lane: "scheduled",
          occurredAt: 1_100,
          excerpt: "updated task",
          trace: {
            reference: "task_audit_log:t1",
            sourceRef: null,
          },
          metadata: {},
        },
      ],
      groupedSignals: [
        {
          signalGroup: "tasks",
          evidenceCount: 1,
          evidenceIds: ["e1"],
          sourceKindCounts: {
            task_audit: 1,
          },
        },
      ],
      independentSignalCount: 1,
    }

    // Act
    const result = evaluateEodLearningDecisions({
      candidates: [
        {
          title: "Tune reminder phrasing",
          confidence: 0.9,
          contradiction: false,
          expectedValue: 0.2,
          evidenceIds: ["e1"],
          rationale: "Repeated user correction",
        },
      ],
      evidenceBundle,
    })

    // Assert
    expect(result[0]?.decision).toBe("skipped_insufficient_signals")
    expect(result[0]?.applyEligible).toBe(false)
  })

  it("always skips contradictory candidates", () => {
    // Arrange
    const evidenceBundle = {
      windowStartedAt: 1_000,
      windowEndedAt: 2_000,
      evidence: [
        {
          id: "e1",
          sourceKind: "task_audit",
          sourceId: "t1",
          signalGroup: "tasks",
          lane: "scheduled",
          occurredAt: 1_100,
          excerpt: "task changed",
          trace: {
            reference: "task_audit_log:t1",
            sourceRef: null,
          },
          metadata: {},
        },
        {
          id: "e2",
          sourceKind: "command_audit",
          sourceId: "c1",
          signalGroup: "commands",
          lane: "interactive",
          occurredAt: 1_150,
          excerpt: "command failed",
          trace: {
            reference: "command_audit_log:c1",
            sourceRef: null,
          },
          metadata: {},
        },
      ],
      groupedSignals: [
        {
          signalGroup: "commands",
          evidenceCount: 1,
          evidenceIds: ["e2"],
          sourceKindCounts: {
            command_audit: 1,
          },
        },
        {
          signalGroup: "tasks",
          evidenceCount: 1,
          evidenceIds: ["e1"],
          sourceKindCounts: {
            task_audit: 1,
          },
        },
      ],
      independentSignalCount: 2,
    }

    // Act
    const result = evaluateEodLearningDecisions({
      candidates: [
        {
          title: "Persist user preference",
          confidence: 0.95,
          contradiction: true,
          expectedValue: 0.7,
          evidenceIds: ["e1", "e2"],
          rationale: "Signals conflict",
        },
      ],
      evidenceBundle,
    })

    // Assert
    expect(result[0]?.decision).toBe("skipped_contradiction")
    expect(result[0]?.applyEligible).toBe(false)
  })

  it("maps confidence bands deterministically", () => {
    // Arrange
    const evidenceBundle = {
      windowStartedAt: 1_000,
      windowEndedAt: 2_000,
      evidence: [
        {
          id: "e1",
          sourceKind: "task_audit",
          sourceId: "t1",
          signalGroup: "tasks",
          lane: "scheduled",
          occurredAt: 1_100,
          excerpt: "task evidence",
          trace: {
            reference: "task_audit_log:t1",
            sourceRef: null,
          },
          metadata: {},
        },
        {
          id: "e2",
          sourceKind: "command_audit",
          sourceId: "c1",
          signalGroup: "commands",
          lane: "interactive",
          occurredAt: 1_120,
          excerpt: "command evidence",
          trace: {
            reference: "command_audit_log:c1",
            sourceRef: null,
          },
          metadata: {},
        },
      ],
      groupedSignals: [
        {
          signalGroup: "commands",
          evidenceCount: 1,
          evidenceIds: ["e2"],
          sourceKindCounts: {
            command_audit: 1,
          },
        },
        {
          signalGroup: "tasks",
          evidenceCount: 1,
          evidenceIds: ["e1"],
          sourceKindCounts: {
            task_audit: 1,
          },
        },
      ],
      independentSignalCount: 2,
    }

    // Act
    const result = evaluateEodLearningDecisions({
      candidates: [
        {
          title: "High confidence",
          confidence: 0.85,
          contradiction: false,
          expectedValue: 0.8,
          evidenceIds: ["e1", "e2"],
          rationale: null,
        },
        {
          title: "Medium confidence",
          confidence: 0.7,
          contradiction: false,
          expectedValue: 0.4,
          evidenceIds: ["e1", "e2"],
          rationale: null,
        },
        {
          title: "Low confidence",
          confidence: 0.4,
          contradiction: false,
          expectedValue: 0.1,
          evidenceIds: ["e1", "e2"],
          rationale: null,
        },
      ],
      evidenceBundle,
    })

    // Assert
    expect(result.map((item) => item.decision)).toEqual([
      "auto_apply_memory_journal_high_confidence",
      "auto_apply_memory_journal",
      "candidate_only_low_confidence",
    ])
    expect(result.map((item) => item.applyEligible)).toEqual([true, true, false])
  })
})
