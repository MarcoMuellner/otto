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

  it("allows explicit user preference candidates with one direct user signal", () => {
    // Arrange
    const evidenceBundle = {
      windowStartedAt: 1_000,
      windowEndedAt: 2_000,
      evidence: [
        {
          id: "in-1",
          sourceKind: "inbound_message",
          sourceId: "in-1",
          signalGroup: "interactive_messages",
          lane: "interactive",
          occurredAt: 1_100,
          excerpt: "Please always keep the Geizhals tab open.",
          trace: {
            reference: "messages_in:in-1",
            sourceRef: "session:sess-1",
          },
          metadata: {},
        },
      ],
      groupedSignals: [
        {
          signalGroup: "interactive_messages",
          evidenceCount: 1,
          evidenceIds: ["in-1"],
          sourceKindCounts: {
            inbound_message: 1,
          },
        },
      ],
      independentSignalCount: 1,
    }

    // Act
    const result = evaluateEodLearningDecisions({
      candidates: [
        {
          title: "Keep Geizhals tab open",
          candidateKind: "user_preference",
          confidence: 0.85,
          contradiction: false,
          expectedValue: 0.6,
          evidenceIds: ["in-1"],
          rationale: "Explicit user preference",
        },
      ],
      evidenceBundle,
    })

    // Assert
    expect(result[0]?.decision).toBe("auto_apply_memory_journal_high_confidence")
    expect(result[0]?.applyEligible).toBe(true)
  })

  it("keeps strict signal gate when user-preference candidate lacks direct user evidence", () => {
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
          title: "Keep Geizhals tab open",
          candidateKind: "user_preference",
          confidence: 0.9,
          contradiction: false,
          expectedValue: 0.6,
          evidenceIds: ["e1"],
          rationale: "No direct user evidence present",
        },
      ],
      evidenceBundle,
    })

    // Assert
    expect(result[0]?.decision).toBe("skipped_insufficient_signals")
    expect(result[0]?.applyEligible).toBe(false)
  })
})
