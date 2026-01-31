import { describe, expect, test } from "vitest";

import { createAgentGraph } from "@agent/graph";
import type { ResponseComposerFn } from "@agent/graph";
import { MemorySaver } from "@langchain/langgraph-checkpoint";

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

  test("accepts a checkpointer for state persistence", async () => {
    // Arrange
    const checkpointer = new MemorySaver();
    const graph = createAgentGraph({
      classify: async () => ({ domains: [], needsTools: false }),
      policyCheck: () => ({ decision: "allow" }),
      tools: {},
      checkpointer,
    });
    const input = {
      input: {
        threadId: "thread-10",
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
    const result = await graph.invoke(input, {
      configurable: { thread_id: "thread-10" },
    });

    // Assert
    expect(result.assistantMessage?.role).toBe("assistant");
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

  test("uses model-backed response composer when provided", async () => {
    // Arrange
    const composer: ResponseComposerFn = async ({ toolResults }) => ({
      role: "assistant",
      content: `Model reply. Tools: ${toolResults?.length ?? 0}`,
    });
    const graph = createAgentGraph({
      classify: async () => ({ domains: [], needsTools: false }),
      policyCheck: () => ({ decision: "allow" }),
      tools: {},
      composeResponse: composer,
    });
    const input = {
      input: {
        threadId: "thread-11",
        channel: "direct",
        messages: [
          {
            role: "user",
            content: "Hello model",
          },
        ],
      },
    };

    // Act
    const result = await graph.invoke(input);

    // Assert
    expect(result.assistantMessage?.content).toBe("Model reply. Tools: 0");
  });

  test("includes tool results in composer context", async () => {
    // Arrange
    const composer: ResponseComposerFn = async ({ toolResults }) => ({
      role: "assistant",
      content: `Got ${toolResults?.length} tool results`,
    });
    const graph = createAgentGraph({
      classify: async () => ({ domains: ["files"], needsTools: true }),
      policyCheck: () => ({ decision: "allow" }),
      tools: {
        "fs.read": async (call) => ({
          toolCallId: call.id,
          name: call.name,
          output: { ok: true },
          success: true,
        }),
      },
      plan: () => ({
        toolCalls: [{ id: "c1", name: "fs.read", args: { path: "/a" } }],
      }),
      composeResponse: composer,
    });
    const input = {
      input: {
        threadId: "thread-12",
        channel: "direct",
        messages: [
          {
            role: "user",
            content: "read file",
          },
        ],
      },
    };

    // Act
    const result = await graph.invoke(input);

    // Assert
    expect(result.assistantMessage?.content).toBe("Got 1 tool results");
  });
});
