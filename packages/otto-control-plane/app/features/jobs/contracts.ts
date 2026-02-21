import { z } from "zod"

export const taskManagedBySchema = z.enum(["system", "operator"])

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
})

export const externalJobListItemSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  scheduleType: z.enum(["recurring", "oneshot"]),
  profileId: z.string().min(1).nullable(),
  status: z.enum(["idle", "running", "paused"]),
  runAt: z.number().int().nullable(),
  cadenceMinutes: z.number().int().min(1).nullable(),
  nextRunAt: z.number().int().nullable(),
  terminalState: z.enum(["completed", "expired", "cancelled"]).nullable(),
  terminalReason: z.string().nullable(),
  updatedAt: z.number().int(),
  managedBy: taskManagedBySchema,
  isMutable: z.boolean(),
})

export const externalJobDetailSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  status: z.enum(["idle", "running", "paused"]),
  scheduleType: z.enum(["recurring", "oneshot"]),
  profileId: z.string().min(1).nullable(),
  runAt: z.number().int().nullable(),
  cadenceMinutes: z.number().int().min(1).nullable(),
  payload: z.string().nullable(),
  lastRunAt: z.number().int().nullable(),
  nextRunAt: z.number().int().nullable(),
  terminalState: z.enum(["completed", "expired", "cancelled"]).nullable(),
  terminalReason: z.string().nullable(),
  lockToken: z.string().nullable(),
  lockExpiresAt: z.number().int().nullable(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  managedBy: taskManagedBySchema,
  isMutable: z.boolean(),
})

export const externalJobAuditEntrySchema = z.object({
  id: z.string().min(1),
  taskId: z.string().min(1),
  action: z.enum(["create", "update", "delete"]),
  lane: z.enum(["interactive", "scheduled"]),
  actor: z.string().nullable(),
  metadataJson: z.string().nullable(),
  createdAt: z.number().int(),
})

export const externalJobsResponseSchema = z.object({
  jobs: z.array(externalJobListItemSchema),
})

export const externalJobResponseSchema = z.object({
  job: externalJobDetailSchema,
})

export const externalJobAuditResponseSchema = z.object({
  taskId: z.string().min(1),
  entries: z.array(externalJobAuditEntrySchema),
})

export type ExternalJobListItem = z.infer<typeof externalJobListItemSchema>
export type ExternalJobDetail = z.infer<typeof externalJobDetailSchema>
export type ExternalJobAuditEntry = z.infer<typeof externalJobAuditEntrySchema>
export type ExternalJobsResponse = z.infer<typeof externalJobsResponseSchema>
export type ExternalJobResponse = z.infer<typeof externalJobResponseSchema>
export type ExternalJobAuditResponse = z.infer<typeof externalJobAuditResponseSchema>
export type HealthResponse = z.infer<typeof healthResponseSchema>
