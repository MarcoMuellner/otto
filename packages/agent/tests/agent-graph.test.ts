import { describe, expect, test } from "vitest";

import { createAgentGraph } from "@agent/graph";
import type { PersistFn, PersistInput, ResponseComposerFn } from "@agent/graph";
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

  describe("persist node", () => {
    test("calls persist callback with audit data after response", async () => {
      // Arrange
      let persistedData: PersistInput | null = null;
      const persist: PersistFn = async (data) => {
        persistedData = data;
      };
      const graph = createAgentGraph({
        classify: async () => ({ domains: [], needsTools: false }),
        policyCheck: () => ({ decision: "allow" }),
        tools: {},
        persist,
      });
      const input = {
        input: {
          threadId: "thread-persist-1",
          channel: "direct",
          messages: [{ role: "user", content: "Hello" }],
        },
      };

      // Act
      await graph.invoke(input);

      // Assert
      expect(persistedData).not.toBeNull();
      expect(persistedData?.threadId).toBe("thread-persist-1");
      expect(persistedData?.intent).toEqual({ domains: [], needsTools: false });
      expect(persistedData?.assistantMessage?.role).toBe("assistant");
    });

    test("includes tool calls and policy decisions in persist data", async () => {
      // Arrange
      let persistedData: PersistInput | null = null;
      const persist: PersistFn = async (data) => {
        persistedData = data;
      };
      const graph = createAgentGraph({
        classify: async () => ({ domains: ["files"], needsTools: true }),
        policyCheck: (call) => ({
          decision: call.name === "allowed.tool" ? "allow" : "deny",
          reason: call.name === "allowed.tool" ? undefined : "Not permitted",
        }),
        tools: {
          "allowed.tool": async (call) => ({
            toolCallId: call.id,
            name: call.name,
            output: { result: "ok" },
            success: true,
          }),
        },
        plan: () => ({
          toolCalls: [
            { id: "c1", name: "allowed.tool", args: {} },
            { id: "c2", name: "denied.tool", args: {} },
          ],
        }),
        persist,
      });
      const input = {
        input: {
          threadId: "thread-persist-2",
          channel: "direct",
          messages: [{ role: "user", content: "Do something" }],
        },
      };

      // Act
      await graph.invoke(input);

      // Assert
      expect(persistedData?.toolCalls).toHaveLength(1);
      expect(persistedData?.toolCalls?.[0].name).toBe("allowed.tool");
      expect(persistedData?.policyDecisions).toHaveLength(2);
      expect(persistedData?.policyDecisions?.[0].decision).toBe("allow");
      expect(persistedData?.policyDecisions?.[1].decision).toBe("deny");
      expect(persistedData?.policyDecisions?.[1].reason).toBe("Not permitted");
    });

    test("includes tool results in persist data", async () => {
      // Arrange
      let persistedData: PersistInput | null = null;
      const persist: PersistFn = async (data) => {
        persistedData = data;
      };
      const graph = createAgentGraph({
        classify: async () => ({ domains: ["files"], needsTools: true }),
        policyCheck: () => ({ decision: "allow" }),
        tools: {
          "my.tool": async (call) => ({
            toolCallId: call.id,
            name: call.name,
            output: { data: 42 },
            success: true,
          }),
        },
        plan: () => ({
          toolCalls: [{ id: "c1", name: "my.tool", args: { x: 1 } }],
        }),
        persist,
      });
      const input = {
        input: {
          threadId: "thread-persist-3",
          channel: "direct",
          messages: [{ role: "user", content: "Run tool" }],
        },
      };

      // Act
      await graph.invoke(input);

      // Assert
      expect(persistedData?.toolResults).toHaveLength(1);
      expect(persistedData?.toolResults?.[0].name).toBe("my.tool");
      expect(persistedData?.toolResults?.[0].output).toEqual({ data: 42 });
      expect(persistedData?.toolResults?.[0].success).toBe(true);
    });

    test("does not fail when persist callback is not provided", async () => {
      // Arrange
      const graph = createAgentGraph({
        classify: async () => ({ domains: [], needsTools: false }),
        policyCheck: () => ({ decision: "allow" }),
        tools: {},
        // No persist callback
      });
      const input = {
        input: {
          threadId: "thread-persist-4",
          channel: "direct",
          messages: [{ role: "user", content: "No persist" }],
        },
      };

      // Act & Assert (should not throw)
      const result = await graph.invoke(input);
      expect(result.assistantMessage?.role).toBe("assistant");
    });

    test("awaits persist callback before completing", async () => {
      // Arrange
      const callOrder: string[] = [];
      const persist: PersistFn = async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        callOrder.push("persist");
      };
      const graph = createAgentGraph({
        classify: async () => ({ domains: [], needsTools: false }),
        policyCheck: () => ({ decision: "allow" }),
        tools: {},
        persist,
      });
      const input = {
        input: {
          threadId: "thread-persist-5",
          channel: "direct",
          messages: [{ role: "user", content: "Wait for persist" }],
        },
      };

      // Act
      await graph.invoke(input);
      callOrder.push("invoke-done");

      // Assert - persist should complete before invoke returns
      expect(callOrder).toEqual(["persist", "invoke-done"]);
    });
  });
});
