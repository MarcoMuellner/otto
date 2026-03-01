import { z } from "zod"

import { modelRefSchema } from "../models/contracts.js"

export const taskManagedBySchema = z.enum(["system", "operator"])
export const INTERACTIVE_BACKGROUND_ONESHOT_JOB_TYPE = "interactive_background_oneshot"

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
})

export const systemServiceStatusSchema = z.enum(["ok", "degraded", "disabled"])

export const externalSystemServiceSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1),
  status: systemServiceStatusSchema,
  message: z.string().trim().min(1),
})

export const externalSystemStatusResponseSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  checkedAt: z.number().int(),
  runtime: z.object({
    version: z.string().trim().min(1),
    pid: z.number().int().min(1),
    startedAt: z.number().int(),
    uptimeSec: z.number().min(0),
  }),
  services: z.array(externalSystemServiceSchema),
})

export const externalSystemRestartResponseSchema = z.object({
  status: z.literal("accepted"),
  requestedAt: z.number().int(),
  message: z.string().trim().min(1),
})

export const externalJobListItemSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  scheduleType: z.enum(["recurring", "oneshot"]),
  profileId: z.string().min(1).nullable(),
  modelRef: modelRefSchema.nullable(),
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
  modelRef: modelRefSchema.nullable(),
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

export const promptProvenanceLayerSchema = z.object({
  layer: z.enum(["core-persona", "surface", "media", "task-profile"]),
  source: z.enum(["system", "user", "inline"]).nullable(),
  path: z.string().nullable(),
  status: z.enum(["resolved", "missing", "invalid"]),
  applied: z.boolean(),
  reason: z.string().nullable(),
})

export const promptProvenanceWarningSchema = z.object({
  code: z.string().trim().min(1),
  message: z.string().trim().min(1),
})

export const promptProvenanceSchema = z.object({
  version: z.literal(1),
  flow: z.enum(["interactive", "scheduled", "background", "watchdog"]),
  media: z.enum(["chatapps", "web", "cli"]).nullable(),
  routeKey: z.string().trim().min(1),
  mappingSource: z.enum(["effective", "system"]),
  layers: z.array(promptProvenanceLayerSchema),
  warnings: z.array(promptProvenanceWarningSchema),
})

export const externalJobRunSchema = z.object({
  id: z.string().min(1),
  jobId: z.string().min(1),
  scheduledFor: z.number().int().nullable(),
  startedAt: z.number().int(),
  finishedAt: z.number().int().nullable(),
  status: z.enum(["success", "failed", "skipped"]),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  resultJson: z.string().nullable(),
  promptProvenance: promptProvenanceSchema.nullable(),
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

export const externalJobRunsResponseSchema = z.object({
  taskId: z.string().min(1),
  total: z.number().int().min(0),
  limit: z.number().int().min(1).max(200),
  offset: z.number().int().min(0),
  runs: z.array(externalJobRunSchema),
})

export const externalJobRunDetailResponseSchema = z.object({
  taskId: z.string().min(1),
  run: externalJobRunSchema,
})

export const createJobMutationRequestSchema = z
  .object({
    id: z.string().trim().min(1).optional(),
    type: z.string().trim().min(1),
    scheduleType: z.enum(["recurring", "oneshot"]),
    runAt: z.number().int().optional(),
    cadenceMinutes: z.number().int().min(1).optional(),
    payload: z.record(z.string(), z.unknown()).optional(),
    profileId: z.string().trim().min(1).optional(),
    modelRef: modelRefSchema.nullable().optional(),
  })
  .superRefine((input, ctx) => {
    if (input.scheduleType === "oneshot" && input.runAt == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "runAt is required for oneshot tasks",
      })
    }

    if (input.scheduleType === "recurring" && input.cadenceMinutes == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "cadenceMinutes is required for recurring tasks",
      })
    }
  })

export const updateJobMutationRequestSchema = z
  .object({
    type: z.string().trim().min(1).optional(),
    scheduleType: z.enum(["recurring", "oneshot"]).optional(),
    runAt: z.number().int().nullable().optional(),
    cadenceMinutes: z.number().int().min(1).nullable().optional(),
    payload: z.record(z.string(), z.unknown()).nullable().optional(),
    profileId: z.string().trim().min(1).nullable().optional(),
    modelRef: modelRefSchema.nullable().optional(),
  })
  .superRefine((input, ctx) => {
    if (input.scheduleType === "recurring" && input.cadenceMinutes === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "cadenceMinutes cannot be null for recurring tasks",
      })
    }

    if (input.scheduleType === "oneshot" && input.runAt === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "runAt cannot be null for oneshot tasks",
      })
    }
  })

export const deleteJobMutationRequestSchema = z.object({
  reason: z.string().trim().min(1).optional(),
})

export const externalJobMutationResponseSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["created", "updated", "deleted", "run_now_scheduled"]),
  scheduledFor: z.number().int().optional(),
})

export const externalBackgroundCancelStopSessionSchema = z.object({
  sessionId: z.string().trim().min(1),
  runId: z.string().trim().min(1),
  status: z.enum(["stopped", "stop_failed"]),
  errorMessage: z.string().nullable(),
})

export const externalBackgroundJobCancelResponseSchema = z.object({
  jobId: z.string().trim().min(1),
  outcome: z.enum(["cancelled", "already_cancelled", "already_terminal"]),
  terminalState: z.enum(["completed", "expired", "cancelled"]),
  stopSessionResults: z.array(externalBackgroundCancelStopSessionSchema),
})

export type ExternalJobListItem = z.infer<typeof externalJobListItemSchema>
export type ExternalJobDetail = z.infer<typeof externalJobDetailSchema>
export type ExternalJobAuditEntry = z.infer<typeof externalJobAuditEntrySchema>
export type ExternalJobRun = z.infer<typeof externalJobRunSchema>
export type ExternalJobsResponse = z.infer<typeof externalJobsResponseSchema>
export type ExternalJobResponse = z.infer<typeof externalJobResponseSchema>
export type ExternalJobAuditResponse = z.infer<typeof externalJobAuditResponseSchema>
export type ExternalJobRunsResponse = z.infer<typeof externalJobRunsResponseSchema>
export type ExternalJobRunDetailResponse = z.infer<typeof externalJobRunDetailResponseSchema>
export type HealthResponse = z.infer<typeof healthResponseSchema>
export type ExternalSystemService = z.infer<typeof externalSystemServiceSchema>
export type ExternalSystemStatusResponse = z.infer<typeof externalSystemStatusResponseSchema>
export type ExternalSystemRestartResponse = z.infer<typeof externalSystemRestartResponseSchema>
export type CreateJobMutationRequest = z.infer<typeof createJobMutationRequestSchema>
export type UpdateJobMutationRequest = z.infer<typeof updateJobMutationRequestSchema>
export type DeleteJobMutationRequest = z.infer<typeof deleteJobMutationRequestSchema>
export type ExternalJobMutationResponse = z.infer<typeof externalJobMutationResponseSchema>
export type ExternalBackgroundJobCancelResponse = z.infer<
  typeof externalBackgroundJobCancelResponseSchema
>
