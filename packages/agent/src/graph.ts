import { randomUUID } from "node:crypto";

import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type { BaseCheckpointSaver } from "@langchain/langgraph-checkpoint";
import { z } from "zod";

import type {
  AgentInput,
  AgentIntent,
  AgentMessage,
  AgentPolicyDecision,
  AgentState,
  AgentToolCall,
  AgentToolResult,
  JsonValue,
} from "./types";

import { AgentIntentSchema, JsonValueSchema } from "./types";

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

export type ResponseComposerInput = {
  messages: AgentMessage[];
  context?: AgentState["context"];
  toolResults?: AgentToolResult[];
};

export type ResponseComposerFn = (
  input: ResponseComposerInput,
) => Promise<AgentMessage>;

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, JsonValue>;
};

export type ToolCallingModel = {
  bindTools: (tools: unknown[]) => {
    invoke: (
      messages: AgentMessage[],
    ) => Promise<{ tool_calls?: unknown; toolCalls?: unknown }>;
  };
};

export type ToolBinding = {
  name: string;
  tool: unknown;
};

export type ToolCallingPlannerOptions = {
  model: ToolCallingModel;
  tools: ToolBinding[];
  idGenerator?: () => string;
};

export type PlannerOptions = {
  invoke: (prompt: string) => Promise<{ content: string } | string>;
  tools: ToolDefinition[];
  idGenerator?: () => string;
};

/*
 * ============================================================================
 * AGENT LOOP OVERVIEW
 * ============================================================================
 *
 * The agent loop processes one user turn at a time through these steps:
 *
 * 1. NORMALIZE INPUT
 *    - Receives: raw input from channel (WhatsApp, TUI, etc.)
 *    - Produces: standardized messages[], media[], threadId in state
 *    - Purpose: all downstream steps see the same shape regardless of source
 *
 * 2. ASSEMBLE CONTEXT
 *    - Receives: normalized state
 *    - Produces: context block (profile facts, RAG snippets, recent summary)
 *    - Purpose: inject long-term memory so the LLM has relevant background
 *
 * 3. CLASSIFY
 *    - Receives: user message + context
 *    - Produces: intent (domains[], needsTools boolean)
 *    - Purpose: decide if we need tools or can respond directly
 *    - Routes to: PLAN (if tools needed) or COMPOSE RESPONSE (if not)
 *
 * 4. PLAN (only if tools needed)
 *    - Receives: user message + intent + available tools
 *    - Produces: toolCalls[] (which tools to run with what arguments)
 *    - Purpose: let the LLM decide which tools to use
 *
 * 5. POLICY CHECK (only if tools needed)
 *    - Receives: toolCalls[]
 *    - Produces: policyDecisions[] + filtered toolCalls[] (only allowed ones)
 *    - Purpose: enforce allow/deny rules before any tool executes
 *
 * 6. EXECUTE TOOLS (only if tools needed)
 *    - Receives: filtered toolCalls[]
 *    - Produces: toolResults[] (output from each tool)
 *    - Purpose: run the actual tool handlers
 *
 * 7. COMPOSE RESPONSE
 *    - Receives: messages[], context, toolResults[] (if any)
 *    - Produces: assistantMessage (the final reply)
 *    - Purpose: generate the response the user sees
 *
 * 8. PERSIST (not yet implemented)
 *    - Receives: full state after response
 *    - Produces: saved messages, audit entries
 *    - Purpose: store conversation for future turns
 *
 * ============================================================================
 */

/**
 * Builds a classifier function around a chat model.
 *
 * Step: Used by CLASSIFY node.
 *
 * The classifier looks at the user message and decides:
 * - Which domains are relevant (e.g., "calendar", "email")
 * - Whether tools are needed to answer
 *
 * If tools are not needed, the loop skips directly to response composition.
 *
 * @param options - Model and domain options for classification.
 * @param options.invoke - Function to call the LLM.
 * @param options.allowedDomains - List of valid domains the classifier can return.
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
 * Step 1: NORMALIZE INPUT
 *
 * First step in the loop. Converts raw channel input into a standard shape.
 *
 * Input: AgentInput from WhatsApp, TUI, API, etc.
 * Output: Populates state.messages[], state.media[], state.threadId
 *
 * After this step, all downstream nodes see the same structure regardless
 * of which channel the message came from.
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
 * Step 2: ASSEMBLE CONTEXT
 *
 * Prepares long-term memory and background knowledge for this turn.
 *
 * Input: Normalized state from step 1
 * Output: Populates state.context (profile facts, RAG snippets, summaries)
 *
 * This is where you inject user preferences, past conversation summaries,
 * and retrieved documents so the LLM has relevant context when responding.
 *
 * Currently a placeholder that preserves existing context.
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
 * Step 3: CLASSIFY
 *
 * Decides whether the user request needs tools or can be answered directly.
 *
 * Input: User message + context from steps 1-2
 * Output: Populates state.intent (domains[], needsTools boolean)
 *
 * Routes the loop:
 * - If needsTools=true → goes to PLAN step
 * - If needsTools=false → skips to COMPOSE RESPONSE step
 *
 * Example: "What time is it?" → needsTools=false (just answer)
 * Example: "What's on my calendar?" → needsTools=true (needs calendar tool)
 *
 * @param classify - Classifier function that determines intent.
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
 * Step 4: PLAN (default placeholder)
 *
 * Decides which tools to call and with what arguments.
 *
 * Input: User message + intent from step 3 + available tools
 * Output: Populates state.toolCalls[] (tool name + arguments for each call)
 *
 * This default implementation returns an empty plan. Use createModelPlanner
 * or createToolCallingPlanner for real LLM-driven planning.
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
 * Step 4: PLAN (LLM JSON planner)
 *
 * Alternative planner that asks the LLM to return tool calls as JSON.
 *
 * Input: User message + available tool definitions
 * Output: Populates state.toolCalls[] based on LLM response
 *
 * The LLM sees a list of tools (name, description, input schema) and
 * returns JSON specifying which tools to call with what arguments.
 *
 * @param options - Model, tool catalog, and ID generator for tool calls.
 * @param options.invoke - Function to call the LLM.
 * @param options.tools - Available tools with name, description, inputSchema.
 * @param options.idGenerator - Optional function to generate tool call IDs.
 */
export function createModelPlanner(options: PlannerOptions): PlannerFn {
  const toolPlanSchema = z.object({
    toolCalls: z.array(
      z.object({
        name: z.string().min(1),
        args: z.record(z.string(), JsonValueSchema),
      }),
    ),
  });

  return async (state: AgentGraphState): Promise<Partial<AgentGraphState>> => {
    if (!state.intent?.needsTools) {
      return {};
    }

    const lastUserMessage = [...state.messages]
      .reverse()
      .find((message) => message.role === "user");

    if (!lastUserMessage) {
      throw new Error("A user message is required for tool planning.");
    }

    const toolCatalog = options.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));

    const prompt = [
      "Select tool calls for the user request using the allowed tools.",
      "Return JSON only with key: toolCalls (array of {name, args}).",
      `Tools: ${JSON.stringify(toolCatalog)}`,
      `Message: ${lastUserMessage.content}`,
    ].join("\n");

    const response = await options.invoke(prompt);
    const content = typeof response === "string" ? response : response.content;
    let parsedJson: unknown;

    try {
      parsedJson = JSON.parse(content);
    } catch {
      throw new Error("Planner returned invalid tool JSON.");
    }

    const parsed = toolPlanSchema.safeParse(parsedJson);

    if (!parsed.success) {
      throw new Error("Planner returned invalid tool JSON.");
    }

    const allowedNames = new Set(options.tools.map((tool) => tool.name));

    if (parsed.data.toolCalls.some((call) => !allowedNames.has(call.name))) {
      throw new Error("Planner returned invalid tool JSON.");
    }

    const nextId = options.idGenerator ?? (() => randomUUID());

    return {
      toolCalls: parsed.data.toolCalls.map((call) => ({
        id: nextId(),
        name: call.name,
        args: call.args,
      })),
    };
  };
}

/**
 * Step 4: PLAN (native tool-calling planner)
 *
 * Alternative planner that uses the model's native tool-calling feature.
 *
 * Input: User message + bound tool definitions
 * Output: Populates state.toolCalls[] from the model's tool_calls response
 *
 * Unlike createModelPlanner (which parses JSON), this uses the model's
 * built-in tool calling (e.g., OpenAI function calling). The model returns
 * structured tool calls directly.
 *
 * @param options - Model bindings, tool catalog, and ID generator.
 * @param options.model - Model with bindTools() method.
 * @param options.tools - Tools to bind to the model.
 * @param options.idGenerator - Optional function to generate tool call IDs.
 */
export function createToolCallingPlanner(
  options: ToolCallingPlannerOptions,
): PlannerFn {
  const toolCallSchema = z.object({
    name: z.string().min(1),
    args: z.record(z.string(), JsonValueSchema),
    id: z.string().min(1).optional(),
  });

  return async (state: AgentGraphState): Promise<Partial<AgentGraphState>> => {
    if (!state.intent?.needsTools) {
      return {};
    }

    const bound = options.model.bindTools(
      options.tools.map((tool) => tool.tool),
    );
    const response = await bound.invoke(state.messages);
    const rawToolCalls =
      "tool_calls" in response ? response.tool_calls : response.toolCalls;

    if (!rawToolCalls) {
      throw new Error("Planner returned invalid tool JSON.");
    }

    const parsed = z.array(toolCallSchema).safeParse(rawToolCalls);

    if (!parsed.success) {
      throw new Error("Planner returned invalid tool JSON.");
    }

    const allowedNames = new Set(options.tools.map((tool) => tool.name));

    if (parsed.data.some((call) => !allowedNames.has(call.name))) {
      throw new Error("Planner returned invalid tool JSON.");
    }

    const nextId = options.idGenerator ?? (() => randomUUID());

    return {
      toolCalls: parsed.data.map((call) => ({
        id: call.id ?? nextId(),
        name: call.name,
        args: call.args,
      })),
    };
  };
}

/**
 * Step 5: POLICY CHECK
 *
 * Filters tool calls based on allow/deny rules before execution.
 *
 * Input: state.toolCalls[] from step 4
 * Output: state.policyDecisions[] + filtered state.toolCalls[] (only allowed)
 *
 * Each tool call is evaluated against the policy function. Denied calls are
 * recorded but removed from toolCalls[], so they won't execute.
 *
 * Example: User tries to delete a file → policy denies → tool doesn't run.
 *
 * @param policyCheck - Function that returns allow/deny for each tool call.
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
 * Step 6: EXECUTE TOOLS
 *
 * Runs the tool calls that passed policy checks.
 *
 * Input: Filtered state.toolCalls[] from step 5
 * Output: state.toolResults[] (output from each tool)
 *
 * Each tool handler is called with the tool call (name + args) and returns
 * a result with success/failure status and output data.
 *
 * Example: calendar.list tool runs → returns [{title: "Meeting", time: "10am"}]
 *
 * @param tools - Map of tool name to handler function.
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
 * Step 7: COMPOSE RESPONSE (default placeholder)
 *
 * Generates the final assistant message the user sees.
 *
 * Input: state.messages[], state.context, state.toolResults[]
 * Output: state.assistantMessage
 *
 * This default implementation just echoes the user message. Use the
 * composeResponse option in createAgentGraph to inject a real LLM composer.
 *
 * @param state - Current graph state containing messages and tool results.
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
 * Step 7: COMPOSE RESPONSE (LLM-backed)
 *
 * Builds a response composer that calls the real LLM to generate the reply.
 *
 * Input: state.messages[], state.context, state.toolResults[]
 * Output: state.assistantMessage from the LLM
 *
 * The composer function receives everything the LLM needs to generate a
 * helpful response: the conversation so far, user profile/context, and
 * any tool outputs to summarize.
 *
 * Example flow:
 * - User asked "What's on my calendar?"
 * - Calendar tool returned [{title: "Meeting", time: "10am"}]
 * - Composer calls LLM: "Summarize these events for the user"
 * - LLM returns: "You have a meeting at 10am"
 *
 * @param composer - Function that calls the LLM and returns the assistant message.
 */
export function createResponseComposer(composer: ResponseComposerFn) {
  return async (state: AgentGraphState): Promise<Partial<AgentGraphState>> => {
    const assistantMessage = await composer({
      messages: state.messages,
      context: state.context,
      toolResults: state.toolResults,
    });

    return {
      assistantMessage,
      messages: [assistantMessage],
    };
  };
}

/**
 * Creates the complete agent loop as a LangGraph state machine.
 *
 * This wires together all the steps:
 *   START → normalizeInput → assembleContext → classify
 *     ↓ (if tools needed)          ↓ (if no tools)
 *     plan → policyCheck →      composeResponse → END
 *     executeTools ────────────────↗
 *
 * All dependencies (classifier, planner, policy, tools, composer) are
 * injected so the loop can be customized without changing the flow.
 *
 * @param options - Dependencies and configuration for the agent loop.
 * @param options.classify - Determines if tools are needed.
 * @param options.policyCheck - Evaluates allow/deny for each tool call.
 * @param options.tools - Map of tool handlers.
 * @param options.plan - Optional custom planner (defaults to empty plan).
 * @param options.composeResponse - Optional LLM composer (defaults to echo).
 * @param options.checkpointer - Optional state persistence.
 */
export function createAgentGraph(options: {
  classify: ClassifierFn;
  policyCheck: PolicyCheckFn;
  tools: Record<string, ToolHandler>;
  plan?: PlannerFn;
  composeResponse?: ResponseComposerFn;
  checkpointer?: BaseCheckpointSaver | false;
}) {
  const classifyNode = classifyIntent(options.classify);
  const planNode = options.plan ?? planTools;
  const policyNode = applyPolicy(options.policyCheck);
  const executeNode = executeTools(options.tools);
  const composeNode = options.composeResponse
    ? createResponseComposer(options.composeResponse)
    : composeResponse;

  const graph = new StateGraph(AgentGraphStateAnnotation)
    .addNode("normalizeInput", normalizeInput)
    .addNode("assembleContext", assembleContext)
    .addNode("classify", classifyNode)
    .addNode("plan", planNode)
    .addNode("policyCheck", policyNode)
    .addNode("executeTools", executeNode)
    .addNode("composeResponse", composeNode)
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

  if (options.checkpointer === undefined) {
    return graph.compile();
  }

  return graph.compile({ checkpointer: options.checkpointer });
}
