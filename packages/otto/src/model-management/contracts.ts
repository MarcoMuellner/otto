import { z } from "zod"

import type { RuntimeModelFlow } from "./types.js"

const runtimeModelFlowValues = [
  "interactiveAssistant",
  "scheduledTasks",
  "heartbeat",
  "watchdogFailures",
] as const satisfies readonly RuntimeModelFlow[]

export const runtimeModelFlowSchema = z.enum(runtimeModelFlowValues)

export const modelRefSchema = z
  .string()
  .trim()
  .regex(/^[^\s/]+\/\S+$/, "model reference must be in provider/model format")

export const DEFAULT_MODEL_FLOW_DEFAULTS: Record<RuntimeModelFlow, string | null> = {
  interactiveAssistant: null,
  scheduledTasks: null,
  heartbeat: null,
  watchdogFailures: null,
}

export const modelFlowDefaultsSchema = z.object({
  interactiveAssistant: modelRefSchema.nullable(),
  scheduledTasks: modelRefSchema.nullable(),
  heartbeat: modelRefSchema.nullable(),
  watchdogFailures: modelRefSchema.nullable(),
})

export const externalModelCatalogResponseSchema = z.object({
  models: z.array(modelRefSchema),
  updatedAt: z.number().int().nullable(),
  source: z.enum(["network", "cache"]),
})

export const externalModelRefreshResponseSchema = z.object({
  status: z.literal("ok"),
  updatedAt: z.number().int(),
  count: z.number().int().min(0),
})

export const externalModelDefaultsResponseSchema = z.object({
  flowDefaults: modelFlowDefaultsSchema,
})

export const externalModelDefaultsUpdateRequestSchema = externalModelDefaultsResponseSchema

export type ModelFlowDefaults = z.infer<typeof modelFlowDefaultsSchema>
export type ExternalModelCatalogResponse = z.infer<typeof externalModelCatalogResponseSchema>
export type ExternalModelRefreshResponse = z.infer<typeof externalModelRefreshResponseSchema>
export type ExternalModelDefaultsResponse = z.infer<typeof externalModelDefaultsResponseSchema>
