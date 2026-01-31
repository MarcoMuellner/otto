import { Annotation, END, START, StateGraph } from "@langchain/langgraph";

import type { AgentInput, AgentMessage, AgentState } from "./types";

const AgentGraphStateAnnotation = Annotation.Root({
  input: Annotation<AgentInput>({
    value: (_current, next) => next,
    default: () => ({
      threadId: "",
      channel: "",
      messages: [],
    }),
  }),
  threadId: Annotation<string>({
    value: (_current, next) => next,
    default: () => "",
  }),
  messages: Annotation<AgentMessage[]>({
    value: (current = [], next = []) => current.concat(next),
    default: () => [],
  }),
  media: Annotation<AgentState["media"]>({
    value: (current = [], next = []) => current.concat(next),
    default: () => [],
  }),
  context: Annotation<AgentState["context"]>({
    value: (_current, next) => next,
    default: () => ({}),
  }),
  assistantMessage: Annotation<AgentMessage | null>({
    value: (_current, next) => next,
    default: () => null,
  }),
});

export type AgentGraphState = typeof AgentGraphStateAnnotation.State;

/**
 * Translates the inbound invocation payload into core state fields for the loop.
 *
 * This provides a consistent state shape for downstream nodes regardless of
 * channel or client, and it guards against missing required input.
 *
 * @param state - Current graph state containing the raw input payload.
 */
export function normalizeInput(
  state: AgentGraphState,
): Partial<AgentGraphState> {
  if (!state.input || state.input.messages.length === 0) {
    throw new Error("Agent input is required to start the graph.");
  }

  return {
    threadId: state.input.threadId,
    messages: state.input.messages,
    media: state.input.media ?? [],
  };
}

/**
 * Establishes the long-term context block for this turn.
 *
 * This is the handoff point for memory and RAG enrichment so later nodes can
 * rely on a stable context shape.
 *
 * @param state - Current graph state with any preloaded context.
 */
export function assembleContext(
  state: AgentGraphState,
): Partial<AgentGraphState> {
  return {
    context: state.context ?? {},
  };
}

/**
 * Produces the assistant response message for the current turn.
 *
 * This is a placeholder response composer until model-backed generation is
 * wired into the loop.
 *
 * @param state - Current graph state containing the latest messages.
 */
export function composeResponse(
  state: AgentGraphState,
): Partial<AgentGraphState> {
  const lastUserMessage = [...state.messages]
    .reverse()
    .find((message) => message.role === "user");

  const assistantMessage: AgentMessage = {
    role: "assistant",
    content: lastUserMessage
      ? `Received: ${lastUserMessage.content}`
      : "Ready.",
  };

  return {
    assistantMessage,
    messages: [assistantMessage],
  };
}

/**
 * Builds the reusable LangGraph agent loop with the core nodes wired together.
 *
 * This keeps the orchestration stable so the model, tools, and memory can be
 * swapped without changing the execution flow.
 */
export function createAgentGraph() {
  const graph = new StateGraph(AgentGraphStateAnnotation)
    .addNode("normalizeInput", normalizeInput)
    .addNode("assembleContext", assembleContext)
    .addNode("composeResponse", composeResponse)
    .addEdge(START, "normalizeInput")
    .addEdge("normalizeInput", "assembleContext")
    .addEdge("assembleContext", "composeResponse")
    .addEdge("composeResponse", END);

  return graph.compile();
}
