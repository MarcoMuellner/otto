import { Annotation, END, START, StateGraph } from "@langchain/langgraph";

import type { AgentInput, AgentMessage, AgentState } from "./types";

const AgentGraphStateAnnotation = Annotation.Root({
  input: Annotation<AgentInput | null>({
    default: () => null,
  }),
  threadId: Annotation<string>({
    default: () => "",
  }),
  messages: Annotation<AgentMessage[]>({
    reducer: (current, next) => current.concat(next),
    default: () => [],
  }),
  media: Annotation<AgentState["media"]>({
    reducer: (current, next) => current.concat(next ?? []),
    default: () => [],
  }),
  context: Annotation<AgentState["context"]>({
    default: () => ({}),
  }),
  assistantMessage: Annotation<AgentMessage | null>({
    default: () => null,
  }),
});

export type AgentGraphState = typeof AgentGraphStateAnnotation.State;

/** Normalizes inbound input into the agent state. */
export function normalizeInput(
  state: AgentGraphState,
): Partial<AgentGraphState> {
  if (!state.input) {
    throw new Error("Agent input is required to start the graph.");
  }

  return {
    threadId: state.input.threadId,
    messages: state.input.messages,
    media: state.input.media ?? [],
  };
}

/** Assembles long-term context for downstream nodes. */
export function assembleContext(
  state: AgentGraphState,
): Partial<AgentGraphState> {
  return {
    context: state.context ?? {},
  };
}

/** Composes the assistant response for the current turn. */
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

/** Builds the reusable LangGraph agent loop. */
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
