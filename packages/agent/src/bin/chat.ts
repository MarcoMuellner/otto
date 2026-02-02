#!/usr/bin/env node
/**
 * CLI entry point for chatting with the Otto agent.
 *
 * Usage:
 *   pnpm --filter @otto/agent chat --api-key <key> [--model <model>]
 *
 * Arguments:
 *   --api-key  OpenAI API key (required)
 *   --model    OpenAI model name (default: gpt-4o-mini)
 */

import * as readline from "node:readline";

import { MemorySaver } from "@langchain/langgraph-checkpoint";

import { createCliAgent, runCli } from "../cli";
import { createModel } from "../model";

/**
 * Parses command line arguments into a key-value map.
 *
 * Expects arguments in the form: --key value --key2 value2
 */
function parseArgs(args: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--") && i + 1 < args.length) {
      const key = arg.slice(2);
      const value = args[i + 1];
      if (!value.startsWith("--")) {
        result[key] = value;
        i++; // Skip the value in next iteration
      }
    }
  }
  return result;
}

/**
 * Main entry point for the CLI chat.
 */
async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const apiKey = args["api-key"];
  const modelName = args["model"] ?? "gpt-4o-mini";

  if (!apiKey) {
    console.error("Error: --api-key is required");
    console.error("");
    console.error("Usage:");
    console.error(
      "  pnpm --filter @otto/agent chat --api-key <key> [--model <model>]",
    );
    console.error("");
    console.error("Arguments:");
    console.error("  --api-key  OpenAI API key (required)");
    console.error("  --model    OpenAI model name (default: gpt-4o-mini)");
    process.exit(1);
  }

  // Create the model
  const model = createModel({
    provider: "openai",
    openai: {
      apiKey,
      model: modelName,
    },
  });

  // Create the agent with conversation history
  const agent = createCliAgent({
    model,
    checkpointer: new MemorySaver(),
  });

  // Generate a unique thread ID for this session
  const threadId = `cli-${Date.now()}`;

  // Set up readline interface
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const writer = {
    write: (text: string) => process.stdout.write(text),
  };

  console.log("");
  console.log("Otto CLI Chat");
  console.log(`Model: ${modelName}`);
  console.log("Type your message and press Enter. Press Ctrl+C to exit.");
  console.log("");

  // Prompt for input
  const prompt = () => rl.question("You: ", handleInput);

  const handleInput = async (input: string) => {
    const trimmed = input.trim();
    if (!trimmed) {
      prompt();
      return;
    }

    try {
      await runCli({
        agent,
        threadId,
        writer,
        input: trimmed,
      });
    } catch (error) {
      console.error("\nError:", error instanceof Error ? error.message : error);
      console.error("");
    }

    prompt();
  };

  // Handle clean exit
  rl.on("close", () => {
    console.log("\nGoodbye!");
    process.exit(0);
  });

  // Start the loop
  prompt();
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
