import { describe, expect, it } from "vitest";

import {
  buildInteractiveContextPromptBlock,
  normalizeInteractiveContextWindowSize,
} from "../src/interactive-context.js";

describe("normalizeInteractiveContextWindowSize", () => {
  it("clamps configured values to 5-200", () => {
    // Assert
    expect(normalizeInteractiveContextWindowSize(2)).toBe(5);
    expect(normalizeInteractiveContextWindowSize(64)).toBe(64);
    expect(normalizeInteractiveContextWindowSize(500)).toBe(200);
  });

  it("falls back to default for invalid values", () => {
    // Assert
    expect(normalizeInteractiveContextWindowSize(undefined)).toBe(20);
    expect(normalizeInteractiveContextWindowSize(12.5)).toBe(20);
    expect(normalizeInteractiveContextWindowSize("20")).toBe(20);
  });
});

describe("buildInteractiveContextPromptBlock", () => {
  it("formats non-interactive events into a stable context block", () => {
    // Arrange
    const events = [
      {
        sourceLane: "scheduler",
        sourceKind: "heartbeat",
        sourceRef: "task-1",
        content: "Heartbeat sent",
        deliveryStatus: "sent" as const,
        deliveryStatusDetail: null,
        errorMessage: null,
      },
      {
        sourceLane: "scheduler",
        sourceKind: "watchdog",
        sourceRef: null,
        content: "   Watchdog queued   ",
        deliveryStatus: "queued" as const,
        deliveryStatusDetail: "retry_scheduled",
        errorMessage: null,
      },
    ];

    // Act
    const result = buildInteractiveContextPromptBlock(events);

    // Assert
    expect(result.includedEvents).toBe(2);
    expect(result.truncated).toBe(false);
    expect(result.block).toContain("Recent non-interactive context:");
    expect(result.block).toContain(
      "- [sent] scheduler/heartbeat(task-1): Heartbeat sent",
    );
    expect(result.block).toContain(
      "- [queued] scheduler/watchdog: Watchdog queued (retry_scheduled)",
    );
  });

  it("returns null block when all entries are empty after normalization", () => {
    // Arrange
    const events = [
      {
        sourceLane: "scheduler",
        sourceKind: "heartbeat",
        sourceRef: null,
        content: "   ",
        deliveryStatus: "sent" as const,
        deliveryStatusDetail: null,
        errorMessage: null,
      },
    ];

    // Act
    const result = buildInteractiveContextPromptBlock(events);

    // Assert
    expect(result.block).toBeNull();
    expect(result.includedEvents).toBe(0);
  });
});
