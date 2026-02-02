import { describe, expect, test, vi } from "vitest";

import { createCliAgent, createLlmAdapter, runCli } from "@agent/cli";
import type { Agent } from "@agent/graph";

describe("createLlmAdapter", () => {
  test("converts prompt string to model invoke and extracts content", async () => {
    // Arrange
    const mockModel = {
      invoke: vi.fn().mockResolvedValue({ content: "LLM response" }),
    };
    const adapter = createLlmAdapter(mockModel);

    // Act
    const result = await adapter.invoke("Hello, world!");

    // Assert
    expect(mockModel.invoke).toHaveBeenCalledWith([
      { role: "user", content: "Hello, world!" },
    ]);
    expect(result).toEqual({ content: "LLM response" });
  });

  test("handles model response with non-string content", async () => {
    // Arrange
    const mockModel = {
      invoke: vi.fn().mockResolvedValue({ content: 123 }),
    };
    const adapter = createLlmAdapter(mockModel);

    // Act
    const result = await adapter.invoke("Test");

    // Assert
    expect(result).toEqual({ content: "123" });
  });
});

describe("runCli", () => {
  test("invokes agent with user input and writes response", async () => {
    // Arrange
    const mockAgent: Agent = {
      invoke: vi.fn().mockResolvedValue({
        threadId: "test-thread",
        assistantMessage: { role: "assistant", content: "Hello back!" },
        toolResults: [],
      }),
    };
    const lines: string[] = [];
    const mockWriter = {
      write: (text: string) => {
        lines.push(text);
      },
    };
    const threadId = "test-thread";

    // Act
    await runCli({
      agent: mockAgent,
      threadId,
      writer: mockWriter,
      input: "Hello",
    });

    // Assert
    expect(mockAgent.invoke).toHaveBeenCalledWith({
      threadId: "test-thread",
      channel: "cli",
      messages: [{ role: "user", content: "Hello" }],
    });
    expect(lines.join("")).toContain("Hello back!");
  });

  test("uses provided threadId for conversation continuity", async () => {
    // Arrange
    const mockAgent: Agent = {
      invoke: vi.fn().mockResolvedValue({
        threadId: "my-thread-123",
        assistantMessage: { role: "assistant", content: "Response" },
        toolResults: [],
      }),
    };
    const mockWriter = { write: () => {} };

    // Act
    await runCli({
      agent: mockAgent,
      threadId: "my-thread-123",
      writer: mockWriter,
      input: "Test message",
    });

    // Assert
    expect(mockAgent.invoke).toHaveBeenCalledWith(
      expect.objectContaining({ threadId: "my-thread-123" }),
    );
  });

  test("handles empty input gracefully", async () => {
    // Arrange
    const mockAgent: Agent = {
      invoke: vi.fn().mockResolvedValue({
        threadId: "test-thread",
        assistantMessage: { role: "assistant", content: "I need input" },
        toolResults: [],
      }),
    };
    const lines: string[] = [];
    const mockWriter = { write: (text: string) => lines.push(text) };

    // Act
    await runCli({
      agent: mockAgent,
      threadId: "test-thread",
      writer: mockWriter,
      input: "",
    });

    // Assert
    expect(mockAgent.invoke).toHaveBeenCalled();
  });
});

describe("createCliAgent", () => {
  test("creates an agent that can be invoked", async () => {
    // Arrange
    const mockModel = {
      invoke: vi.fn().mockResolvedValue({
        content: '{"domains": [], "needsTools": false}',
      }),
    };
    // Second call for composer
    mockModel.invoke.mockResolvedValueOnce({
      content: '{"domains": [], "needsTools": false}',
    });
    mockModel.invoke.mockResolvedValueOnce({
      content: "Hello! How can I help you?",
    });

    const agent = createCliAgent({ model: mockModel });

    // Act
    const output = await agent.invoke({
      threadId: "test-thread",
      channel: "cli",
      messages: [{ role: "user", content: "Hello" }],
    });

    // Assert
    expect(output.threadId).toBe("test-thread");
    expect(output.assistantMessage.role).toBe("assistant");
    expect(output.assistantMessage.content).toBe("Hello! How can I help you?");
  });

  test("uses provided checkpointer for conversation history", async () => {
    // Arrange
    const mockModel = {
      invoke: vi.fn().mockResolvedValue({
        content: '{"domains": [], "needsTools": false}',
      }),
    };
    mockModel.invoke.mockResolvedValueOnce({
      content: '{"domains": [], "needsTools": false}',
    });
    mockModel.invoke.mockResolvedValueOnce({
      content: "First response",
    });
    mockModel.invoke.mockResolvedValueOnce({
      content: '{"domains": [], "needsTools": false}',
    });
    mockModel.invoke.mockResolvedValueOnce({
      content: "Second response",
    });

    const { MemorySaver } = await import("@langchain/langgraph-checkpoint");
    const checkpointer = new MemorySaver();
    const agent = createCliAgent({ model: mockModel, checkpointer });

    // Act - two invocations with same threadId
    await agent.invoke({
      threadId: "persistent-thread",
      channel: "cli",
      messages: [{ role: "user", content: "First message" }],
    });
    const output = await agent.invoke({
      threadId: "persistent-thread",
      channel: "cli",
      messages: [{ role: "user", content: "Second message" }],
    });

    // Assert
    expect(output.assistantMessage.content).toBe("Second response");
  });

  test("allows all tool calls by default", async () => {
    // Arrange
    const mockModel = {
      invoke: vi.fn(),
    };
    mockModel.invoke.mockResolvedValueOnce({
      content: '{"domains": ["test"], "needsTools": true}',
    });
    mockModel.invoke.mockResolvedValueOnce({
      content: "Tool result processed",
    });

    const toolHandler = vi.fn().mockResolvedValue({
      toolCallId: "call-1",
      name: "test.tool",
      output: { result: "ok" },
      success: true,
    });

    const agent = createCliAgent({
      model: mockModel,
      tools: { "test.tool": toolHandler },
      plan: () => ({
        toolCalls: [{ id: "call-1", name: "test.tool", args: {} }],
      }),
    });

    // Act
    await agent.invoke({
      threadId: "tool-thread",
      channel: "cli",
      messages: [{ role: "user", content: "Run a tool" }],
    });

    // Assert - tool was called (not blocked by policy)
    expect(toolHandler).toHaveBeenCalled();
  });
});
