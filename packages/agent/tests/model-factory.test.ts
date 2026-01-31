import { describe, expect, test } from "vitest";

import { ChatOpenAI } from "@langchain/openai";

import { createModel } from "@agent/model";

describe("createModel", () => {
  test("creates an OpenAI model for valid config", () => {
    // Arrange
    const config = {
      provider: "openai",
      openai: {
        apiKey: "test-key",
        model: "gpt-5.2",
      },
      temperature: 0.2,
    } as const;

    // Act
    const model = createModel(config);

    // Assert
    expect(model).toBeInstanceOf(ChatOpenAI);
  });

  test("rejects missing provider configuration", () => {
    // Arrange
    const config = {
      provider: "openai",
    } as const;

    // Act
    const buildModel = () => createModel(config);

    // Assert
    expect(buildModel).toThrow();
  });
});
