import { describe, expect, test } from "vitest";

import { createAgentGraph } from "@agent/graph";

describe("agent graph", () => {
  test("returns an assistant message for a simple input", async () => {
    // Arrange
    const graph = createAgentGraph();
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
});
