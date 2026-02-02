import type { Agent } from "./graph";

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
