import { describe, expect, test } from "vitest";

import {
  AgentInputSchema,
  AgentOutputSchema,
  AgentStateSchema,
} from "@agent/types";

describe("agent types", () => {
  test("accepts a minimal valid AgentInput", () => {
    // Arrange
    const result = AgentInputSchema.safeParse({
      threadId: "thread-1",
      channel: "direct",
      messages: [
        {
          role: "user",
          content: "Hello",
        },
      ],
    });

    // Act
    const isValid = result.success;

    // Assert
    expect(isValid).toBe(true);
  });

  test("rejects AgentInput without messages", () => {
    // Arrange
    const result = AgentInputSchema.safeParse({
      threadId: "thread-1",
      channel: "direct",
      messages: [],
    });

    // Act
    const isValid = result.success;

    // Assert
    expect(isValid).toBe(false);
  });

  test("accepts a valid AgentOutput", () => {
    // Arrange
    const result = AgentOutputSchema.safeParse({
      threadId: "thread-1",
      assistantMessage: {
        role: "assistant",
        content: "Hi there",
      },
      toolResults: [],
    });

    // Act
    const isValid = result.success;

    // Assert
    expect(isValid).toBe(true);
  });

  test("accepts a valid AgentState", () => {
    // Arrange
    const result = AgentStateSchema.safeParse({
      threadId: "thread-1",
      messages: [
        {
          role: "user",
          content: "Ping",
        },
      ],
    });

    // Act
    const isValid = result.success;

    // Assert
    expect(isValid).toBe(true);
  });
});
