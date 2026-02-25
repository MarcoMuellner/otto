import { z } from "zod"

export const chatThreadBindingSchema = z.object({
  key: z.string().min(1),
  source: z.enum(["telegram", "scheduler", "unknown"]),
  label: z.string().min(1),
})

export const chatThreadSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  updatedAt: z.number().int(),
  isBound: z.boolean(),
  isStale: z.boolean(),
  bindings: z.array(chatThreadBindingSchema),
})

export const chatThreadsResponseSchema = z.object({
  threads: z.array(chatThreadSchema),
  degraded: z.boolean(),
  message: z.string().optional(),
})

export const chatMessageSchema = z.object({
  id: z.string().trim().min(1),
  role: z.enum(["user", "assistant", "system", "tool", "unknown"]),
  text: z.string(),
  createdAt: z.number().int(),
  partTypes: z.array(z.string().trim().min(1)),
})

export const chatMessagesResponseSchema = z.object({
  thread: chatThreadSchema,
  messages: z.array(chatMessageSchema),
  degraded: z.boolean(),
  message: z.string().optional(),
})

export const createChatThreadRequestSchema = z.object({
  title: z.string().trim().min(1).optional(),
})

export const createChatThreadResponseSchema = z.object({
  thread: chatThreadSchema,
})

export const sendChatMessageRequestSchema = z.object({
  text: z.string().trim().min(1),
})

export const sendChatMessageResponseSchema = z.object({
  reply: chatMessageSchema.nullable(),
})

export const chatStreamStartedEventSchema = z.object({
  type: z.literal("started"),
  messageId: z.string().trim().min(1),
  createdAt: z.number().int(),
})

export const chatStreamDeltaEventSchema = z.object({
  type: z.literal("delta"),
  messageId: z.string().trim().min(1),
  delta: z.string(),
  text: z.string(),
  partTypes: z.array(z.string().trim().min(1)),
})

export const chatStreamCompletedEventSchema = z.object({
  type: z.literal("completed"),
  reply: chatMessageSchema.nullable(),
})

export const chatStreamErrorEventSchema = z.object({
  type: z.literal("error"),
  message: z.string().trim().min(1),
})

export const chatStreamEventSchema = z.union([
  chatStreamStartedEventSchema,
  chatStreamDeltaEventSchema,
  chatStreamCompletedEventSchema,
  chatStreamErrorEventSchema,
])

export type ChatThreadBinding = z.infer<typeof chatThreadBindingSchema>
export type ChatThread = z.infer<typeof chatThreadSchema>
export type ChatThreadsResponse = z.infer<typeof chatThreadsResponseSchema>
export type ChatMessage = z.infer<typeof chatMessageSchema>
export type ChatMessagesResponse = z.infer<typeof chatMessagesResponseSchema>
export type CreateChatThreadRequest = z.infer<typeof createChatThreadRequestSchema>
export type CreateChatThreadResponse = z.infer<typeof createChatThreadResponseSchema>
export type SendChatMessageRequest = z.infer<typeof sendChatMessageRequestSchema>
export type SendChatMessageResponse = z.infer<typeof sendChatMessageResponseSchema>
export type ChatStreamStartedEvent = z.infer<typeof chatStreamStartedEventSchema>
export type ChatStreamDeltaEvent = z.infer<typeof chatStreamDeltaEventSchema>
export type ChatStreamCompletedEvent = z.infer<typeof chatStreamCompletedEventSchema>
export type ChatStreamErrorEvent = z.infer<typeof chatStreamErrorEventSchema>
export type ChatStreamEvent = z.infer<typeof chatStreamEventSchema>
