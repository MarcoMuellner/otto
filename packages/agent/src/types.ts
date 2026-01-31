import { z } from "zod";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
);

/** What kind of message role is present in the agent loop. */
export const AgentMessageRoleSchema = z.enum([
  "system",
  "user",
  "assistant",
  "tool",
]);

/** What kind of media reference is attached to a message. */
export const AgentMediaRefSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["image", "file", "audio"]),
  mimeType: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  uri: z.string().min(1).optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
});

/** What a single agent message looks like in the loop. */
export const AgentMessageSchema = z.object({
  role: AgentMessageRoleSchema,
  content: z.string(),
  id: z.string().min(1).optional(),
  mediaIds: z.array(z.string().min(1)).optional(),
  toolCallId: z.string().min(1).optional(),
  toolName: z.string().min(1).optional(),
});

/** What a tool call request looks like in the loop. */
export const AgentToolCallSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  args: z.record(z.string(), JsonValueSchema),
});

/** What a tool execution result looks like in the loop. */
export const AgentToolResultSchema = z.object({
  toolCallId: z.string().min(1),
  name: z.string().min(1),
  output: JsonValueSchema,
  success: z.boolean(),
  error: z.string().min(1).optional(),
});

/** What a policy decision looks like for a tool call. */
export const AgentPolicyDecisionSchema = z.object({
  toolCallId: z.string().min(1),
  decision: z.enum(["allow", "deny"]),
  reason: z.string().min(1).optional(),
});

/** What the intent classification result looks like. */
export const AgentIntentSchema = z.object({
  domains: z.array(z.string()),
  needsTools: z.boolean(),
});

/** What the inbound agent invocation payload looks like. */
export const AgentInputSchema = z.object({
  threadId: z.string().min(1),
  channel: z.string().min(1),
  messages: z.array(AgentMessageSchema).min(1),
  media: z.array(AgentMediaRefSchema).optional(),
  contextHints: z
    .object({
      timezone: z.string().min(1).optional(),
      locale: z.string().min(1).optional(),
      userId: z.string().min(1).optional(),
    })
    .optional(),
});

/** What the outbound agent response looks like. */
export const AgentOutputSchema = z.object({
  threadId: z.string().min(1),
  assistantMessage: AgentMessageSchema.extend({
    role: z.literal("assistant"),
  }),
  toolResults: z.array(AgentToolResultSchema),
  requiresUserAction: z.boolean().optional(),
  nextActionId: z.string().min(1).optional(),
});

/** What the persisted agent state looks like between steps. */
export const AgentStateSchema = z.object({
  threadId: z.string().min(1),
  messages: z.array(AgentMessageSchema),
  media: z.array(AgentMediaRefSchema).optional(),
  context: z
    .object({
      profileFacts: z.record(z.string(), JsonValueSchema).optional(),
      ragSnippets: z.array(z.string()).optional(),
      recentSummary: z.string().optional(),
    })
    .optional(),
  intent: AgentIntentSchema.optional(),
  toolCalls: z.array(AgentToolCallSchema).optional(),
  toolResults: z.array(AgentToolResultSchema).optional(),
  policyDecisions: z.array(AgentPolicyDecisionSchema).optional(),
});

export type AgentMessageRole = z.infer<typeof AgentMessageRoleSchema>;
export type AgentMediaRef = z.infer<typeof AgentMediaRefSchema>;
export type AgentMessage = z.infer<typeof AgentMessageSchema>;
export type AgentToolCall = z.infer<typeof AgentToolCallSchema>;
export type AgentToolResult = z.infer<typeof AgentToolResultSchema>;
export type AgentPolicyDecision = z.infer<typeof AgentPolicyDecisionSchema>;
export type AgentIntent = z.infer<typeof AgentIntentSchema>;
export type AgentInput = z.infer<typeof AgentInputSchema>;
export type AgentOutput = z.infer<typeof AgentOutputSchema>;
export type AgentState = z.infer<typeof AgentStateSchema>;
