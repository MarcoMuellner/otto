import { z } from "zod"

export const modelRefSchema = z
  .string()
  .trim()
  .regex(/^[^\s/]+\/\S+$/, "model reference must be in provider/model format")

export const modelFlowDefaultsSchema = z.object({
  interactiveAssistant: modelRefSchema.nullable(),
  scheduledTasks: modelRefSchema.nullable(),
  heartbeat: modelRefSchema.nullable(),
  watchdogFailures: modelRefSchema.nullable(),
})

export const modelCatalogResponseSchema = z.object({
  models: z.array(modelRefSchema),
  updatedAt: z.number().int().nullable(),
  source: z.enum(["network", "cache"]),
})

export const modelRefreshResponseSchema = z.object({
  status: z.literal("ok"),
  updatedAt: z.number().int(),
  count: z.number().int().min(0),
})

export const modelDefaultsResponseSchema = z.object({
  flowDefaults: modelFlowDefaultsSchema,
})

export const modelDefaultsUpdateRequestSchema = modelDefaultsResponseSchema

export type ModelCatalogResponse = z.infer<typeof modelCatalogResponseSchema>
export type ModelRefreshResponse = z.infer<typeof modelRefreshResponseSchema>
export type ModelDefaultsResponse = z.infer<typeof modelDefaultsResponseSchema>
export type ModelDefaultsUpdateRequest = z.infer<typeof modelDefaultsUpdateRequestSchema>
