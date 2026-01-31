import { Annotation, END, START, StateGraph } from "@langchain/langgraph";

import type {
  AgentInput,
  AgentIntent,
  AgentMessage,
  AgentPolicyDecision,
  AgentState,
  AgentToolCall,
  AgentToolResult,
} from "./types";

import { AgentIntentSchema } from "./types";

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
  intent: Annotation<AgentIntent | undefined>({
    value: (_current, next) => next,
    default: () => undefined,
  }),
  toolCalls: Annotation<AgentToolCall[] | undefined>({
    value: (_current, next) => next,
    default: () => undefined,
  }),
  policyDecisions: Annotation<AgentPolicyDecision[] | undefined>({
    value: (_current, next) => next,
    default: () => undefined,
  }),
  toolResults: Annotation<AgentToolResult[] | undefined>({
    value: (_current, next) => next,
    default: () => undefined,
  }),
  assistantMessage: Annotation<AgentMessage | null>({
    value: (_current, next) => next,
    default: () => null,
  }),
});

export type AgentGraphState = typeof AgentGraphStateAnnotation.State;

export type ClassifierInput = {
  message: AgentMessage;
  context?: AgentState["context"];
};

export type ClassifierFn = (input: ClassifierInput) => Promise<AgentIntent>;

export type ClassifierOptions = {
  invoke: (prompt: string) => Promise<{ content: string } | string>;
  allowedDomains?: string[];
};

export type PolicyCheckFn = (call: AgentToolCall) => {
  decision: "allow" | "deny";
  reason?: string;
};

export type ToolHandler = (call: AgentToolCall) => Promise<AgentToolResult>;

export type PlannerFn = (
  state: AgentGraphState,
) => Partial<AgentGraphState> | Promise<Partial<AgentGraphState>>;

/**
 * Builds a classifier function around a chat model.
 *
 * This keeps classification prompts consistent while allowing the caller to
 * supply any model with a compatible invoke signature.
 *
 * @param options - Model and domain options for classification.
 */
export function createModelClassifier(
  options: ClassifierOptions,
): ClassifierFn {
  return async ({ message }) => {
    const allowedDomains = options.allowedDomains ?? [];
    const allowedLabel = allowedDomains.length
      ? `Allowed domains: ${allowedDomains.join(", ")}.`
      : "Allowed domains: none.";
    const prompt = [
      "Classify the user message into domains and whether tools are needed.",
      "Return JSON only with keys: domains (string[]), needsTools (boolean).",
      allowedLabel,
      `Message: ${message.content}`,
    ].join("\n");

    const response = await options.invoke(prompt);
    const content = typeof response === "string" ? response : response.content;
    let parsedJson: unknown;

    try {
      parsedJson = JSON.parse(content);
    } catch {
      throw new Error("Classifier returned invalid intent JSON.");
    }

    const parsed = AgentIntentSchema.safeParse(parsedJson);

    if (!parsed.success) {
      throw new Error("Classifier returned invalid intent JSON.");
    }

    if (
      allowedDomains.length > 0 &&
      parsed.data.domains.some((domain) => !allowedDomains.includes(domain))
    ) {
      throw new Error("Classifier returned invalid intent JSON.");
    }

    return parsed.data;
  };
}

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
 * Classifies the incoming request to decide whether tool planning is needed.
 *
 * This keeps later nodes focused on execution by producing a concise intent.
 *
 * @param classify - Classifier used to derive intent for this turn.
 */
export function classifyIntent(classify: ClassifierFn) {
  return async (state: AgentGraphState): Promise<Partial<AgentGraphState>> => {
    const lastUserMessage = [...state.messages]
      .reverse()
      .find((message) => message.role === "user");

    if (!lastUserMessage) {
      throw new Error("A user message is required for classification.");
    }

    const intent = await classify({
      message: lastUserMessage,
      context: state.context,
    });

    return {
      intent,
    };
  };
}

/**
 * Creates a placeholder tool plan when tools are required.
 *
 * This preserves the branch point for upcoming tool selection logic.
 *
 * @param state - Current graph state containing the intent decision.
 */
export function planTools(state: AgentGraphState): Partial<AgentGraphState> {
  if (!state.intent?.needsTools) {
    return {};
  }

  return {
    toolCalls: [],
  };
}

/**
 * Applies policy decisions to planned tool calls.
 *
 * This enforces centralized allow/deny rules before any tool executes.
 *
 * @param policyCheck - Policy evaluator for each tool call.
 */
export function applyPolicy(policyCheck: PolicyCheckFn) {
  return (state: AgentGraphState): Partial<AgentGraphState> => {
    const toolCalls = state.toolCalls ?? [];

    if (toolCalls.length === 0) {
      return {
        policyDecisions: [],
        toolCalls: [],
      };
    }

    const decisions = toolCalls.map((call) => ({
      toolCallId: call.id,
      ...policyCheck(call),
    }));

    const allowedIds = new Set(
      decisions
        .filter((decision) => decision.decision === "allow")
        .map((decision) => decision.toolCallId),
    );

    return {
      policyDecisions: decisions,
      toolCalls: toolCalls.filter((call) => allowedIds.has(call.id)),
    };
  };
}

/**
 * Executes tool calls that passed policy checks.
 *
 * This produces tool results while keeping missing tool handlers visible.
 *
 * @param tools - Tool handlers keyed by tool name.
 */
export function executeTools(tools: Record<string, ToolHandler>) {
  return async (state: AgentGraphState): Promise<Partial<AgentGraphState>> => {
    const toolCalls = state.toolCalls ?? [];

    if (toolCalls.length === 0) {
      return {
        toolResults: [],
      };
    }

    const results = await Promise.all(
      toolCalls.map(async (call) => {
        const handler = tools[call.name];

        if (!handler) {
          return {
            toolCallId: call.id,
            name: call.name,
            output: { error: "Tool not registered." },
            success: false,
            error: "Tool not registered.",
          };
        }

        return handler(call);
      }),
    );

    return {
      toolResults: results,
    };
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
export function createAgentGraph(options: {
  classify: ClassifierFn;
  policyCheck: PolicyCheckFn;
  tools: Record<string, ToolHandler>;
  plan?: PlannerFn;
}) {
  const classifyNode = classifyIntent(options.classify);
  const planNode = options.plan ?? planTools;
  const policyNode = applyPolicy(options.policyCheck);
  const executeNode = executeTools(options.tools);

  const graph = new StateGraph(AgentGraphStateAnnotation)
    .addNode("normalizeInput", normalizeInput)
    .addNode("assembleContext", assembleContext)
    .addNode("classify", classifyNode)
    .addNode("plan", planNode)
    .addNode("policyCheck", policyNode)
    .addNode("executeTools", executeNode)
    .addNode("composeResponse", composeResponse)
    .addEdge(START, "normalizeInput")
    .addEdge("normalizeInput", "assembleContext")
    .addEdge("assembleContext", "classify")
    .addConditionalEdges("classify", (state) =>
      state.intent?.needsTools ? "plan" : "composeResponse",
    )
    .addEdge("plan", "policyCheck")
    .addEdge("policyCheck", "executeTools")
    .addEdge("executeTools", "composeResponse")
    .addEdge("composeResponse", END);

  return graph.compile();
}
