import { z } from "zod"

import { promptProvenanceSchema } from "../jobs/contracts.js"

export const promptFileSourceSchema = z.enum(["system", "user"])

export const promptFileEntrySchema = z.object({
  source: promptFileSourceSchema,
  relativePath: z.string().trim().min(1),
  editable: z.boolean(),
})

export const promptFilesResponseSchema = z.object({
  files: z.array(promptFileEntrySchema),
})

export const promptFileResponseSchema = z.object({
  file: promptFileEntrySchema.extend({
    content: z.string(),
  }),
})

export const updatePromptFileRequestSchema = z.object({
  source: promptFileSourceSchema,
  relativePath: z.string().trim().min(1),
  content: z.string(),
})

export const updatePromptFileResponseSchema = z.object({
  status: z.literal("updated"),
  file: promptFileEntrySchema.extend({
    updatedAt: z.number().int(),
  }),
})

export const recentPromptProvenanceEntrySchema = z.object({
  runId: z.string().trim().min(1),
  jobId: z.string().trim().min(1),
  jobType: z.string().trim().min(1),
  startedAt: z.number().int(),
  status: z.enum(["success", "failed", "skipped"]),
  provenance: promptProvenanceSchema,
})

export type PromptFileSource = z.infer<typeof promptFileSourceSchema>
export type PromptFileEntry = z.infer<typeof promptFileEntrySchema>
export type PromptFilesResponse = z.infer<typeof promptFilesResponseSchema>
export type PromptFileResponse = z.infer<typeof promptFileResponseSchema>
export type UpdatePromptFileRequest = z.infer<typeof updatePromptFileRequestSchema>
export type UpdatePromptFileResponse = z.infer<typeof updatePromptFileResponseSchema>
export type RecentPromptProvenanceEntry = z.infer<typeof recentPromptProvenanceEntrySchema>
export type PromptProvenance = z.infer<typeof promptProvenanceSchema>
