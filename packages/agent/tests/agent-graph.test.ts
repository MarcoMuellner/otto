import { describe, expect, test } from "vitest";

import { createAgentGraph } from "@agent/graph";

describe("agent graph", () => {
  test("returns an assistant message for a simple input", async () => {
    // Arrange
    const graph = createAgentGraph({
      classify: async () => ({ domains: [], needsTools: false }),
      policyCheck: () => ({ decision: "allow" }),
      tools: {},
    });
    const input = {
      input: {
        threadId: "thread-1",
        channel: "direct",
        messages: [
          {
            role: "user",
            content: "Hello",
          },
        ],
      },
    };

    // Act
    const result = await graph.invoke(input);

    // Assert
    expect(result.assistantMessage?.role).toBe("assistant");
    expect(result.assistantMessage?.content).toContain("Hello");
  });

  test("skips planning when tools are not needed", async () => {
    // Arrange
    const graph = createAgentGraph({
      classify: async () => ({ domains: [], needsTools: false }),
      policyCheck: () => ({ decision: "allow" }),
      tools: {},
    });
    const input = {
      input: {
        threadId: "thread-2",
        channel: "direct",
        messages: [
          {
            role: "user",
            content: "No tools",
          },
        ],
      },
    };

    // Act
    const result = await graph.invoke(input);

    // Assert
    expect(result.intent?.needsTools).toBe(false);
    expect(result.toolCalls).toBeUndefined();
  });

  test("adds an empty tool plan when tools are needed", async () => {
    // Arrange
    const graph = createAgentGraph({
      classify: async () => ({ domains: ["calendar"], needsTools: true }),
      policyCheck: () => ({ decision: "allow" }),
      tools: {},
    });
    const input = {
      input: {
        threadId: "thread-3",
        channel: "direct",
        messages: [
          {
            role: "user",
            content: "Check my calendar",
          },
        ],
      },
    };

    // Act
    const result = await graph.invoke(input);

    // Assert
    expect(result.intent?.needsTools).toBe(true);
    expect(result.toolCalls).toEqual([]);
  });
});
