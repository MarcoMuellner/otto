import { describe, expect, it } from "vitest"

import type { EodLearningRunArtifacts } from "../../src/persistence/repositories.js"
import { buildEodLearningDigestMessage } from "../../src/scheduler/eod-learning/digest.js"

const buildRunArtifacts = (
  overrides?: Partial<EodLearningRunArtifacts["run"]>,
  items: EodLearningRunArtifacts["items"] = []
): EodLearningRunArtifacts => {
  return {
    run: {
      id: "run-1",
      profileId: "eod-learning",
      lane: "scheduled",
      windowStartedAt: 1_000,
      windowEndedAt: 2_000,
      startedAt: 2_050,
      finishedAt: 2_100,
      status: "success",
      summaryJson: JSON.stringify({
        candidateCount: items.length,
        followUpScheduledCount: 1,
        followUpSkippedCount: 0,
        followUpFailedCount: 0,
      }),
      createdAt: 2_050,
      ...overrides,
    },
    items,
  }
}

describe("eod-learning digest formatter", () => {
  it("formats concise success digest with run id, counts, and highlights", () => {
    // Arrange
    const artifacts = buildRunArtifacts(undefined, [
      {
        item: {
          id: "item-1",
          runId: "run-1",
          ordinal: 0,
          title: "Improve reminder phrasing",
          decision: "auto_apply_memory_journal_high_confidence",
          confidence: 0.92,
          contradictionFlag: 0,
          expectedValue: 0.5,
          applyStatus: "applied",
          applyError: null,
          metadataJson: null,
          createdAt: 2_100,
        },
        evidence: [],
        actions: [],
      },
      {
        item: {
          id: "item-2",
          runId: "run-1",
          ordinal: 1,
          title: "Lower confidence follow-up",
          decision: "candidate_only_low_confidence",
          confidence: 0.42,
          contradictionFlag: 0,
          expectedValue: 0.2,
          applyStatus: "candidate_only",
          applyError: null,
          metadataJson: null,
          createdAt: 2_100,
        },
        evidence: [],
        actions: [],
      },
    ])

    // Act
    const digest = buildEodLearningDigestMessage(artifacts)

    // Assert
    expect(digest).toContain("EOD digest (success)")
    expect(digest).toContain("- run: run-1")
    expect(digest).toContain("- candidates: 2")
    expect(digest).toContain("applied 1")
    expect(digest).toContain("candidate-only 1")
    expect(digest).toContain("follow-ups: scheduled 1, skipped 0, failed 0")
    expect(digest).toContain("Improve reminder phrasing")
  })

  it("reflects partial-failure outcomes in digest counts", () => {
    // Arrange
    const artifacts = buildRunArtifacts(
      {
        id: "run-partial",
        summaryJson: JSON.stringify({
          candidateCount: 3,
          followUpScheduledCount: 1,
          followUpSkippedCount: 1,
          followUpFailedCount: 1,
        }),
      },
      [
        {
          item: {
            id: "item-a",
            runId: "run-partial",
            ordinal: 0,
            title: "Applied item",
            decision: "auto_apply_memory_journal",
            confidence: 0.7,
            contradictionFlag: 0,
            expectedValue: 0.2,
            applyStatus: "applied",
            applyError: null,
            metadataJson: null,
            createdAt: 2_100,
          },
          evidence: [],
          actions: [],
        },
        {
          item: {
            id: "item-b",
            runId: "run-partial",
            ordinal: 1,
            title: "Failed apply item",
            decision: "auto_apply_memory_journal_high_confidence",
            confidence: 0.9,
            contradictionFlag: 0,
            expectedValue: 0.3,
            applyStatus: "failed",
            applyError: "mutation failed",
            metadataJson: null,
            createdAt: 2_100,
          },
          evidence: [],
          actions: [],
        },
        {
          item: {
            id: "item-c",
            runId: "run-partial",
            ordinal: 2,
            title: "Skipped item",
            decision: "skipped_contradiction",
            confidence: 0.8,
            contradictionFlag: 1,
            expectedValue: 0.1,
            applyStatus: "skipped",
            applyError: null,
            metadataJson: null,
            createdAt: 2_100,
          },
          evidence: [],
          actions: [],
        },
      ]
    )

    // Act
    const digest = buildEodLearningDigestMessage(artifacts)

    // Assert
    expect(digest).toContain("- run: run-partial")
    expect(digest).toContain("applied 1, skipped 1, candidate-only 0, failed 1")
    expect(digest).toContain("follow-ups: scheduled 1, skipped 1, failed 1")
  })

  it("formats empty-learning windows without leaking raw payloads", () => {
    // Arrange
    const artifacts = buildRunArtifacts(
      {
        id: "run-empty",
        summaryJson: JSON.stringify({
          candidateCount: 0,
          followUpScheduledCount: 0,
          followUpSkippedCount: 0,
          followUpFailedCount: 0,
        }),
      },
      []
    )

    // Act
    const digest = buildEodLearningDigestMessage(artifacts)

    // Assert
    expect(digest).toContain("- candidates: 0")
    expect(digest).toContain("- highlights: none in this window")
    expect(digest).not.toContain("metadataJson")
  })
})
