import { describe, expect, it } from "vitest"

import type { EodLearningRunArtifacts } from "../../src/persistence/repositories.js"
import {
  buildEodLearningDigestInterpretationPrompt,
  buildEodLearningDigestMessage,
  parseEodLearningDigestMessage,
} from "../../src/scheduler/eod-learning/digest.js"

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
  it("formats concise success digest with counts and plain-language highlights", () => {
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
    expect(digest).toContain("EOD learning complete.")
    expect(digest).toContain("Reviewed 2 candidates")
    expect(digest).toContain("1 applied")
    expect(digest).toContain("1 noted for later")
    expect(digest).toContain("Follow-ups: 1 scheduled, 0 not scheduled, 0 failed")
    expect(digest).toContain("Top items:")
    expect(digest).toContain("Improve reminder phrasing: applied")
    expect(digest).not.toContain("run-1")
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
    expect(digest).toContain(
      "Reviewed 3 candidates: 1 applied, 1 skipped, 0 noted for later, 1 failed"
    )
    expect(digest).toContain("Follow-ups: 1 scheduled, 1 not scheduled, 1 failed")
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
    expect(digest).toContain("Reviewed 0 candidates")
    expect(digest).toContain("Top items: none.")
    expect(digest).not.toContain("metadataJson")
  })

  it("surfaces policy and scheduled follow-up context in readable wording", () => {
    // Arrange
    const artifacts = buildRunArtifacts(
      {
        id: "run-readable",
        summaryJson: JSON.stringify({
          candidateCount: 1,
          followUpScheduledCount: 1,
          followUpSkippedCount: 0,
          followUpFailedCount: 0,
        }),
      },
      [
        {
          item: {
            id: "item-readable",
            runId: "run-readable",
            ordinal: 0,
            title: "Interactive one-shot background jobs fail on output contract violations",
            decision: "auto_apply_memory_journal_high_confidence",
            confidence: 0.93,
            contradictionFlag: 0,
            expectedValue: 0.82,
            applyStatus: "skipped",
            applyError: null,
            metadataJson: JSON.stringify({
              policyReason: "high_confidence",
            }),
            createdAt: 2_100,
          },
          evidence: [],
          actions: [
            {
              id: "action-memory",
              runId: "run-readable",
              itemId: "item-readable",
              ordinal: 0,
              actionType: "memory_replace",
              status: "skipped",
              expectedValue: 0.82,
              detail:
                "Skipped as duplicate: existing project memory already encodes this failure mode.",
              errorMessage: null,
              metadataJson: "{}",
              createdAt: 2_100,
            },
            {
              id: "action-follow-up",
              runId: "run-readable",
              itemId: "item-readable",
              ordinal: 1,
              actionType: "follow_up_schedule",
              status: "success",
              expectedValue: 0.84,
              detail: "Scheduled follow-up task task-1",
              errorMessage: null,
              metadataJson: JSON.stringify({
                proposalTitle: "Add strict final-output validator with fallback envelope",
              }),
              createdAt: 2_100,
            },
          ],
        },
      ]
    )

    // Act
    const digest = buildEodLearningDigestMessage(artifacts)

    // Assert
    expect(digest).toContain("Why items were skipped: 1 already captured, no durable change")
    expect(digest).toContain("Planned follow-ups:")
    expect(digest).toContain("Add strict final-output validator with fallback envelope")
    expect(digest).toContain("not persisted: Skipped as duplicate")
    expect(digest).not.toContain("task-1")
  })

  it("parses structured LLM digest payload", () => {
    // Arrange
    const output = JSON.stringify({
      message: "Short operator digest",
    })

    // Act
    const parsed = parseEodLearningDigestMessage(output)

    // Assert
    expect(parsed.message).toBe("Short operator digest")
    expect(parsed.parseErrorCode).toBeNull()
  })

  it("builds digest interpretation prompt with run context JSON", () => {
    // Arrange
    const artifacts = buildRunArtifacts()

    // Act
    const prompt = buildEodLearningDigestInterpretationPrompt(artifacts)

    // Assert
    expect(prompt).toContain("Return ONLY valid JSON with this exact shape:")
    expect(prompt).toContain('"message"')
    expect(prompt).toContain('"run"')
    expect(prompt).not.toContain('"run-1"')
    expect(prompt).toContain("Do not include internal ids")
  })
})
