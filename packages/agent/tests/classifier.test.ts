import { describe, expect, test } from "vitest";

import { createModelClassifier } from "@agent/graph";

describe("createModelClassifier", () => {
  test("parses a valid intent JSON response", async () => {
    // Arrange
    const classifier = createModelClassifier({
      allowedDomains: ["email", "calendar"],
      invoke: async () =>
        JSON.stringify({ domains: ["email"], needsTools: true }),
    });

    // Act
    const result = await classifier({
      message: { role: "user", content: "Check my inbox" },
      context: {},
    });

    // Assert
    expect(result).toEqual({ domains: ["email"], needsTools: true });
  });

  test("rejects domains outside the allowed list", async () => {
    // Arrange
    const classifier = createModelClassifier({
      allowedDomains: ["email"],
      invoke: async () =>
        JSON.stringify({ domains: ["calendar"], needsTools: true }),
    });

    // Act
    const runClassifier = () =>
      classifier({ message: { role: "user", content: "Hi" }, context: {} });

    // Assert
    await expect(runClassifier).rejects.toThrow(
      "Classifier returned invalid intent JSON.",
    );
  });

  test("throws when the intent response is invalid", async () => {
    // Arrange
    const classifier = createModelClassifier({
      invoke: async () => "not json",
    });

    // Act
    const runClassifier = () =>
      classifier({ message: { role: "user", content: "Hi" }, context: {} });

    // Assert
    await expect(runClassifier).rejects.toThrow(
      "Classifier returned invalid intent JSON.",
    );
  });
});
