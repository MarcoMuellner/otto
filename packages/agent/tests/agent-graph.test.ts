import { describe, expect, test } from "vitest";

import { createAgent, createAgentGraph } from "@agent/graph";
import type {
  LearnFn,
  LearnInput,
  PersistFn,
  PersistInput,
  ResponseComposerFn,
} from "@agent/graph";
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

  describe("learn node", () => {
    test("calls learn callback with conversation data after response", async () => {
      // Arrange
      let learnedData: LearnInput | null = null;
      const learn: LearnFn = async (data) => {
        learnedData = data;
      };
      const graph = createAgentGraph({
        classify: async () => ({ domains: [], needsTools: false }),
        policyCheck: () => ({ decision: "allow" }),
        tools: {},
        learn,
      });
      const input = {
        input: {
          threadId: "thread-learn-1",
          channel: "direct",
          messages: [{ role: "user", content: "My name is Marco" }],
        },
      };

      // Act
      await graph.invoke(input);

      // Assert
      expect(learnedData).not.toBeNull();
      expect(learnedData?.threadId).toBe("thread-learn-1");
      expect(learnedData?.messages).toHaveLength(2); // user + assistant
      expect(learnedData?.assistantMessage?.role).toBe("assistant");
    });

    test("includes existing context in learn data for deduplication", async () => {
      // Arrange
      let learnedData: LearnInput | null = null;
      const learn: LearnFn = async (data) => {
        learnedData = data;
      };
      const graph = createAgentGraph({
        classify: async () => ({ domains: [], needsTools: false }),
        policyCheck: () => ({ decision: "allow" }),
        tools: {},
        learn,
      });
      const input = {
        input: {
          threadId: "thread-learn-2",
          channel: "direct",
          messages: [{ role: "user", content: "I prefer mornings" }],
        },
        context: {
          profileFacts: { name: "Marco" },
        },
      };

      // Act
      await graph.invoke(input);

      // Assert
      expect(learnedData?.context?.profileFacts).toEqual({ name: "Marco" });
    });

    test("does not fail when learn callback is not provided", async () => {
      // Arrange
      const graph = createAgentGraph({
        classify: async () => ({ domains: [], needsTools: false }),
        policyCheck: () => ({ decision: "allow" }),
        tools: {},
        // No learn callback
      });
      const input = {
        input: {
          threadId: "thread-learn-3",
          channel: "direct",
          messages: [{ role: "user", content: "No learning" }],
        },
      };

      // Act & Assert (should not throw)
      const result = await graph.invoke(input);
      expect(result.assistantMessage?.role).toBe("assistant");
    });

    test("runs learn before persist", async () => {
      // Arrange
      const callOrder: string[] = [];
      const learn: LearnFn = async () => {
        callOrder.push("learn");
      };
      const persist: PersistFn = async () => {
        callOrder.push("persist");
      };
      const graph = createAgentGraph({
        classify: async () => ({ domains: [], needsTools: false }),
        policyCheck: () => ({ decision: "allow" }),
        tools: {},
        learn,
        persist,
      });
      const input = {
        input: {
          threadId: "thread-learn-4",
          channel: "direct",
          messages: [{ role: "user", content: "Order test" }],
        },
      };

      // Act
      await graph.invoke(input);

      // Assert - learn runs before persist
      expect(callOrder).toEqual(["learn", "persist"]);
    });

    test("awaits learn callback before continuing", async () => {
      // Arrange
      const callOrder: string[] = [];
      const learn: LearnFn = async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        callOrder.push("learn");
      };
      const persist: PersistFn = async () => {
        callOrder.push("persist");
      };
      const graph = createAgentGraph({
        classify: async () => ({ domains: [], needsTools: false }),
        policyCheck: () => ({ decision: "allow" }),
        tools: {},
        learn,
        persist,
      });
      const input = {
        input: {
          threadId: "thread-learn-5",
          channel: "direct",
          messages: [{ role: "user", content: "Async test" }],
        },
      };

      // Act
      await graph.invoke(input);

      // Assert - learn completes before persist starts
      expect(callOrder).toEqual(["learn", "persist"]);
    });
  });
});

describe("createAgent", () => {
  test("returns agent output with assistant message", async () => {
    // Arrange
    const agent = createAgent({
      classify: async () => ({ domains: [], needsTools: false }),
      policyCheck: () => ({ decision: "allow" }),
      tools: {},
    });
    const input = {
      threadId: "thread-agent-1",
      channel: "whatsapp",
      messages: [{ role: "user" as const, content: "Hello" }],
    };

    // Act
    const output = await agent.invoke(input);

    // Assert
    expect(output.threadId).toBe("thread-agent-1");
    expect(output.assistantMessage.role).toBe("assistant");
    expect(output.assistantMessage.content).toContain("Hello");
  });

  test("returns tool results in output", async () => {
    // Arrange
    const agent = createAgent({
      classify: async () => ({ domains: ["files"], needsTools: true }),
      policyCheck: () => ({ decision: "allow" }),
      tools: {
        "fs.read": async (call) => ({
          toolCallId: call.id,
          name: call.name,
          output: { content: "file data" },
          success: true,
        }),
      },
      plan: () => ({
        toolCalls: [{ id: "c1", name: "fs.read", args: { path: "/a" } }],
      }),
    });
    const input = {
      threadId: "thread-agent-2",
      channel: "direct",
      messages: [{ role: "user" as const, content: "read file" }],
    };

    // Act
    const output = await agent.invoke(input);

    // Assert
    expect(output.toolResults).toHaveLength(1);
    expect(output.toolResults[0].name).toBe("fs.read");
    expect(output.toolResults[0].success).toBe(true);
  });

  test("returns empty tool results when no tools used", async () => {
    // Arrange
    const agent = createAgent({
      classify: async () => ({ domains: [], needsTools: false }),
      policyCheck: () => ({ decision: "allow" }),
      tools: {},
    });
    const input = {
      threadId: "thread-agent-3",
      channel: "direct",
      messages: [{ role: "user" as const, content: "Hello" }],
    };

    // Act
    const output = await agent.invoke(input);

    // Assert
    expect(output.toolResults).toEqual([]);
  });

  test("uses threadId for checkpointer configuration", async () => {
    // Arrange
    const checkpointer = new MemorySaver();
    const agent = createAgent({
      classify: async () => ({ domains: [], needsTools: false }),
      policyCheck: () => ({ decision: "allow" }),
      tools: {},
      checkpointer,
    });

    // Act - invoke twice with same threadId
    await agent.invoke({
      threadId: "thread-agent-4",
      channel: "direct",
      messages: [{ role: "user" as const, content: "First message" }],
    });
    const output = await agent.invoke({
      threadId: "thread-agent-4",
      channel: "direct",
      messages: [{ role: "user" as const, content: "Second message" }],
    });

    // Assert - second invoke should have access to conversation history
    expect(output.threadId).toBe("thread-agent-4");
    expect(output.assistantMessage.role).toBe("assistant");
  });

  test("calls learn and persist callbacks", async () => {
    // Arrange
    const callOrder: string[] = [];
    const learn: LearnFn = async () => {
      callOrder.push("learn");
    };
    const persist: PersistFn = async () => {
      callOrder.push("persist");
    };
    const agent = createAgent({
      classify: async () => ({ domains: [], needsTools: false }),
      policyCheck: () => ({ decision: "allow" }),
      tools: {},
      learn,
      persist,
    });
    const input = {
      threadId: "thread-agent-5",
      channel: "direct",
      messages: [{ role: "user" as const, content: "Test callbacks" }],
    };

    // Act
    await agent.invoke(input);

    // Assert
    expect(callOrder).toEqual(["learn", "persist"]);
  });
});
