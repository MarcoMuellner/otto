import type { BaseCheckpointSaver } from "@langchain/langgraph-checkpoint";

import {
  createAgent,
  createModelClassifier,
  type Agent,
  type PlannerFn,
  type ToolHandler,
} from "./graph";

/**
 * Minimal interface for an LLM model that can be invoked with messages.
 *
 * This matches the shape of LangChain chat models like ChatOpenAI.
 */
export type LlmModel = {
  invoke: (
    messages: Array<{ role: string; content: string }>,
  ) => Promise<{ content: unknown }>;
};

/**
 * Adapter interface that our classifier and composer expect.
 *
 * Takes a prompt string and returns the model's response content.
 */
export type LlmAdapter = {
  invoke: (prompt: string) => Promise<{ content: string }>;
};

/**
 * Writer interface for outputting text to the user.
 *
 * Abstracted for testability — in production this writes to stdout.
 */
export type Writer = {
  write: (text: string) => void;
};

/**
 * Options for running a single CLI turn.
 */
export type RunCliOptions = {
  agent: Agent;
  threadId: string;
  writer: Writer;
  input: string;
};

/**
 * Creates an adapter that bridges a LangChain chat model to our invoke signature.
 *
 * Our classifier and composer expect `invoke(prompt) => { content: string }`.
 * LangChain models expect `invoke(messages[]) => { content: unknown }`.
 * This adapter handles the conversion.
 *
 * @param model - A LangChain-compatible chat model with invoke method.
 */
export function createLlmAdapter(model: LlmModel): LlmAdapter {
  return {
    invoke: async (prompt: string): Promise<{ content: string }> => {
      const response = await model.invoke([{ role: "user", content: prompt }]);
      return { content: String(response.content) };
    },
  };
}

/**
 * Processes a single CLI turn: sends user input to the agent and writes the response.
 *
 * This is the core logic of the CLI loop, extracted for testability.
 * The actual readline loop is handled separately in the entry point.
 *
 * @param options - Agent, thread ID, writer, and user input for this turn.
 */
export async function runCli(options: RunCliOptions): Promise<void> {
  const { agent, threadId, writer, input } = options;

  const output = await agent.invoke({
    threadId,
    channel: "cli",
    messages: [{ role: "user", content: input }],
  });

  writer.write(`\nAssistant: ${output.assistantMessage.content}\n\n`);
}

/**
 * Options for creating a CLI agent.
 */
export type CliAgentOptions = {
  model: LlmModel;
  checkpointer?: BaseCheckpointSaver;
  tools?: Record<string, ToolHandler>;
  plan?: PlannerFn;
};

/**
 * Creates a fully-wired agent for CLI chat usage.
 *
 * This factory wires together:
 * - LLM-backed classifier (decides if tools are needed)
 * - LLM-backed response composer (generates assistant messages)
 * - Permissive policy (allows all tool calls)
 * - Optional checkpointer for conversation history
 * - Optional tools and planner
 *
 * @param options - Model and optional configuration for the agent.
 * @param options.model - LangChain-compatible chat model.
 * @param options.checkpointer - Optional state persistence for conversation history.
 * @param options.tools - Optional tool handlers.
 * @param options.plan - Optional custom planner.
 */
export function createCliAgent(options: CliAgentOptions): Agent {
  const { model, checkpointer, tools = {}, plan } = options;
  const adapter = createLlmAdapter(model);

  return createAgent({
    classify: createModelClassifier({
      invoke: adapter.invoke,
      allowedDomains: [],
    }),
    policyCheck: () => ({ decision: "allow" }),
    tools,
    plan,
    composeResponse: async ({ messages, toolResults }) => {
      // Build conversation for the model
      const systemMessage = {
        role: "system",
        content:
          "You are Otto, a helpful personal assistant. Be concise and friendly.",
      };

      // Include tool results in context if present
      let contextMessage = "";
      if (toolResults && toolResults.length > 0) {
        contextMessage = `\n\nTool results:\n${JSON.stringify(toolResults, null, 2)}`;
      }

      const messagesWithContext = [
        systemMessage,
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ];

      if (contextMessage) {
        messagesWithContext.push({ role: "system", content: contextMessage });
      }

      const response = await model.invoke(messagesWithContext);
      return {
        role: "assistant",
        content: String(response.content),
      };
    },
    checkpointer: checkpointer ?? false,
  });
}
