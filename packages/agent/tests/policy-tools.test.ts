import { describe, expect, test } from "vitest";

import { createAgentGraph } from "@agent/graph";

describe("agent policy and tools", () => {
  test("filters denied tool calls before execution", async () => {
    // Arrange
    const graph = createAgentGraph({
      classify: async () => ({ domains: ["files"], needsTools: true }),
      plan: () => ({
        toolCalls: [
          { id: "call-1", name: "fs.read", args: { path: "/tmp/a" } },
          { id: "call-2", name: "fs.write", args: { path: "/tmp/b" } },
        ],
      }),
      policyCheck: (call) => ({
        decision: call.name === "fs.read" ? "allow" : "deny",
        reason: call.name === "fs.read" ? undefined : "blocked",
      }),
      tools: {
        "fs.read": async (call) => ({
          toolCallId: call.id,
          name: call.name,
          output: { ok: true },
          success: true,
        }),
      },
    });
    const input = {
      input: {
        threadId: "thread-4",
        channel: "direct",
        messages: [
          {
            role: "user",
            content: "read a file",
          },
        ],
      },
    };

    // Act
    const result = await graph.invoke(input);

    // Assert
    expect(result.policyDecisions).toHaveLength(2);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolResults).toHaveLength(1);
    expect(result.toolResults?.[0].name).toBe("fs.read");
  });
});
