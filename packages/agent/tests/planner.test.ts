import { describe, expect, test } from "vitest";

import type { AgentGraphState } from "@agent/graph";
import { createModelPlanner, createToolCallingPlanner } from "@agent/graph";

describe("createModelPlanner", () => {
  test("creates tool calls with generated IDs", async () => {
    // Arrange
    const planner = createModelPlanner({
      tools: [
        {
          name: "fs.read",
          description: "Read a file",
          inputSchema: { path: "string" },
        },
      ],
      idGenerator: () => "call-1",
      invoke: async () =>
        JSON.stringify({
          toolCalls: [{ name: "fs.read", args: { path: "/a" } }],
        }),
    });
    const state = {
      intent: { domains: ["files"], needsTools: true },
      messages: [{ role: "user", content: "read" }],
    } as AgentGraphState;

    // Act
    const result = await planner(state);

    // Assert
    expect(result.toolCalls).toEqual([
      { id: "call-1", name: "fs.read", args: { path: "/a" } },
    ]);
  });

  test("rejects tool calls outside the allowed tools", async () => {
    // Arrange
    const planner = createModelPlanner({
      tools: [
        {
          name: "fs.read",
          description: "Read a file",
          inputSchema: { path: "string" },
        },
      ],
      invoke: async () =>
        JSON.stringify({
          toolCalls: [{ name: "fs.write", args: { path: "/b" } }],
        }),
    });
    const state = {
      intent: { domains: ["files"], needsTools: true },
      messages: [{ role: "user", content: "write" }],
    } as AgentGraphState;

    // Act
    const runPlanner = () => planner(state);

    // Assert
    await expect(runPlanner).rejects.toThrow(
      "Planner returned invalid tool JSON.",
    );
  });

  test("skips planning when tools are not needed", async () => {
    // Arrange
    const planner = createModelPlanner({
      tools: [],
      invoke: async () => JSON.stringify({ toolCalls: [] }),
    });
    const state = {
      intent: { domains: [], needsTools: false },
      messages: [{ role: "user", content: "hello" }],
    } as AgentGraphState;

    // Act
    const result = await planner(state);

    // Assert
    expect(result.toolCalls).toBeUndefined();
  });

  test("maps tool calls from a tool-calling model", async () => {
    // Arrange
    const planner = createToolCallingPlanner({
      tools: [
        {
          name: "fs.read",
          tool: { name: "fs.read" },
        },
      ],
      idGenerator: () => "call-42",
      model: {
        bindTools: () => ({
          invoke: async () => ({
            tool_calls: [{ name: "fs.read", args: { path: "/a" } }],
          }),
        }),
      },
    });
    const state = {
      intent: { domains: ["files"], needsTools: true },
      messages: [{ role: "user", content: "read" }],
    } as AgentGraphState;

    // Act
    const result = await planner(state);

    // Assert
    expect(result.toolCalls).toEqual([
      { id: "call-42", name: "fs.read", args: { path: "/a" } },
    ]);
  });

  test("rejects tool calls that are not in the tool bindings", async () => {
    // Arrange
    const planner = createToolCallingPlanner({
      tools: [
        {
          name: "fs.read",
          tool: { name: "fs.read" },
        },
      ],
      model: {
        bindTools: () => ({
          invoke: async () => ({
            tool_calls: [{ name: "fs.write", args: { path: "/b" } }],
          }),
        }),
      },
    });
    const state = {
      intent: { domains: ["files"], needsTools: true },
      messages: [{ role: "user", content: "write" }],
    } as AgentGraphState;

    // Act
    const runPlanner = () => planner(state);

    // Assert
    await expect(runPlanner).rejects.toThrow(
      "Planner returned invalid tool JSON.",
    );
  });
});
