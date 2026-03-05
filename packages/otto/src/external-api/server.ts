import { randomUUID } from "node:crypto"

import Fastify, { type FastifyInstance } from "fastify"
import type { Logger } from "pino"
import { z, ZodError } from "zod"

import { cancelInteractiveBackgroundJob } from "../api-services/interactive-background-jobs-control.js"
import {
  INTERACTIVE_BACKGROUND_ONESHOT_JOB_TYPE,
  spawnInteractiveBackgroundJob,
} from "../api-services/interactive-background-jobs.js"
import {
  applyNotificationProfileUpdate,
  diffNotificationProfileFields,
  notificationProfileUpdateSchema,
  resolveNotificationProfile,
} from "../api-services/settings-notification-profile.js"
import {
  createTaskMutation,
  deleteTaskMutation,
  runTaskNowMutation,
  taskCreateInputSchema,
  taskDeleteInputSchema,
  TaskMutationError,
  taskUpdateInputSchema,
  updateTaskMutation,
} from "../api-services/tasks-mutations.js"
import {
  getTaskById,
  listTasksForLane,
  mapTaskDetailsForExternal,
  mapTaskListForExternal,
} from "../api-services/tasks-read.js"
import { buildOpenApiDocument, type OpenApiOperationSpec } from "../api/openapi.js"
import { extractBearerToken } from "../api/http-auth.js"
import { resolveApiTokenPath, resolveOrCreateApiToken } from "../api/token.js"
import type { OttoModelFlowDefaults } from "../config/otto-config.js"
import {
  externalModelCatalogResponseSchema,
  externalModelDefaultsResponseSchema,
  externalModelDefaultsUpdateRequestSchema,
  externalModelRefreshResponseSchema,
  modelRefSchema,
} from "../model-management/contracts.js"
import type { ModelCatalogSnapshot } from "../model-management/types.js"
import type {
  InteractivePromptResolution,
  PromptProvenance,
  InteractivePromptSurface,
  PromptFileEntry,
  PromptFileReadResult,
  PromptFileWriteResult,
  PromptLayerSource,
} from "../prompt-management/index.js"
import { PromptFileAccessError } from "../prompt-management/index.js"
import type {
  CommandAuditRecord,
  JobRecord,
  JobRunRecord,
  JobRunSessionRecord,
  TaskAuditRecord,
  TaskListRecord,
  UserProfileRecord,
} from "../persistence/repositories.js"
import { resolveSchedulerConfig } from "../scheduler/config.js"
import { getAppVersion } from "../version.js"

const DEFAULT_HOST = "0.0.0.0"
const DEFAULT_PORT = 4190
const EXTERNAL_OPENAPI_JSON_PATH = "/external/openapi.json"
const EXTERNAL_OPENAPI_UI_PATH = "/external/docs"

export type ExternalApiConfig = {
  host: string
  port: number
  token: string
  tokenPath: string
  baseUrl: string
}

export type ExternalSystemServiceStatus = "ok" | "degraded" | "disabled"

export type ExternalSystemStatusResponse = {
  status: "ok" | "degraded"
  checkedAt: number
  runtime: {
    version: string
    pid: number
    startedAt: number
    uptimeSec: number
  }
  services: Array<{
    id: string
    label: string
    status: ExternalSystemServiceStatus
    message: string
  }>
}

export type ExternalSystemRestartResponse = {
  status: "accepted"
  requestedAt: number
  message: string
}

type ExternalApiServerDependencies = {
  logger: Logger
  config: ExternalApiConfig
  systemStatusProvider?: () => ExternalSystemStatusResponse
  restartRuntime?: () => Promise<void>
  jobsRepository: {
    listTasks: () => TaskListRecord[]
    getById: (jobId: string) => JobRecord | null
    listRunsByJobId: (
      jobId: string,
      options?: {
        limit?: number
        offset?: number
      }
    ) => JobRunRecord[]
    countRunsByJobId: (jobId: string) => number
    getRunById: (jobId: string, runId: string) => JobRunRecord | null
    createTask: (record: JobRecord) => void
    updateTask: (
      jobId: string,
      update: {
        type: string
        scheduleType: "recurring" | "oneshot"
        profileId: string | null
        modelRef: string | null
        runAt: number | null
        cadenceMinutes: number | null
        payload: string | null
        nextRunAt: number | null
      },
      updatedAt?: number
    ) => void
    cancelTask: (jobId: string, reason: string | null, updatedAt?: number) => void
    runTaskNow: (jobId: string, scheduledFor: number, updatedAt?: number) => void
  }
  executeBackgroundJobNow?: (jobId: string) => Promise<void>
  isBackgroundExecutionReady?: () => boolean
  jobRunSessionsRepository?: {
    listActiveByJobId: (jobId: string) => JobRunSessionRecord[]
    markClosed: (runId: string, closedAt: number, closeErrorMessage: string | null) => void
    markCloseError: (runId: string, closeErrorMessage: string) => void
  }
  sessionController?: {
    closeSession: (sessionId: string) => Promise<void>
  }
  taskAuditRepository: {
    listByTaskId: (taskId: string, limit?: number) => TaskAuditRecord[]
    listRecent?: (limit?: number) => TaskAuditRecord[]
    insert: (record: TaskAuditRecord) => void
  }
  commandAuditRepository?: {
    insert: (record: CommandAuditRecord) => void
    listRecent?: (limit?: number) => CommandAuditRecord[]
  }
  userProfileRepository?: {
    get: () => UserProfileRecord | null
    upsert: (record: UserProfileRecord) => void
  }
  modelManagement?: {
    getCatalogSnapshot: () => ModelCatalogSnapshot
    refreshCatalog: () => Promise<ModelCatalogSnapshot>
    getFlowDefaults: () => Promise<OttoModelFlowDefaults>
    updateFlowDefaults: (flowDefaults: OttoModelFlowDefaults) => Promise<OttoModelFlowDefaults>
  }
  promptManagement?: {
    resolveInteractiveSystemPrompt?: (
      surface: InteractivePromptSurface
    ) => Promise<InteractivePromptResolution>
    listPromptFiles?: () => Promise<PromptFileEntry[]>
    readPromptFile?: (input: {
      source: PromptLayerSource
      relativePath: string
    }) => Promise<PromptFileReadResult>
    writePromptFile?: (input: {
      source: PromptLayerSource
      relativePath: string
      content: string
    }) => Promise<PromptFileWriteResult>
  }
}

const listJobsQuerySchema = z.object({
  lane: z.enum(["interactive", "scheduled"]).optional().default("scheduled"),
  type: z.string().trim().min(1).optional(),
})

const getJobParamsSchema = z.object({
  id: z.string().trim().min(1),
})

const listAuditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional().default(20),
})

const listRunsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
})

const getRunParamsSchema = z.object({
  id: z.string().trim().min(1),
  runId: z.string().trim().min(1),
})

const mutateJobParamsSchema = z.object({
  id: z.string().trim().min(1),
})

const cancelBackgroundJobParamsSchema = z.object({
  id: z.string().trim().min(1),
})

const cancelBackgroundJobRequestSchema = z.object({
  reason: z.string().trim().min(1).optional(),
})

const createBackgroundOneshotRequestSchema = z.object({
  prompt: z.string().trim().min(1),
  content: z.unknown(),
})

const getBackgroundOneshotStatusParamsSchema = z.object({
  sessionId: z.string().trim().min(1),
})

const interactivePromptSurfaceSchema = z.enum(["telegram", "web", "cli"])

const interactivePromptQuerySchema = z.object({
  surface: interactivePromptSurfaceSchema.optional().default("web"),
})

const promptFileSourceSchema = z.enum(["system", "user"])

const promptFileQuerySchema = z.object({
  source: promptFileSourceSchema,
  path: z.string().trim().min(1),
})

const updatePromptFileRequestSchema = z.object({
  source: promptFileSourceSchema,
  path: z.string().trim().min(1),
  content: z.string(),
})

const taskListRecordSchema = z.object({
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
  managedBy: z.enum(["system", "operator"]),
  isMutable: z.boolean(),
})

const jobRecordSchema = z.object({
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
  managedBy: z.enum(["system", "operator"]),
  isMutable: z.boolean(),
})

const taskAuditEntrySchema = z.object({
  id: z.string().min(1),
  taskId: z.string().min(1),
  action: z.enum(["create", "update", "delete"]),
  lane: z.enum(["interactive", "scheduled"]),
  actor: z.string().nullable(),
  metadataJson: z.string().nullable(),
  createdAt: z.number().int(),
})

const promptProvenanceLayerSchema = z.object({
  layer: z.enum(["core-persona", "surface", "media", "task-profile"]),
  source: z.enum(["system", "user", "inline"]).nullable(),
  path: z.string().nullable(),
  status: z.enum(["resolved", "missing", "invalid"]),
  applied: z.boolean(),
  reason: z.string().nullable(),
})

const promptProvenanceWarningSchema = z.object({
  code: z.string().trim().min(1),
  message: z.string().trim().min(1),
})

const promptProvenanceSchema = z.object({
  version: z.literal(1),
  flow: z.enum(["interactive", "scheduled", "background", "watchdog"]),
  media: z.enum(["chatapps", "web", "cli"]).nullable(),
  routeKey: z.string().trim().min(1),
  mappingSource: z.enum(["effective", "system"]),
  layers: z.array(promptProvenanceLayerSchema),
  warnings: z.array(promptProvenanceWarningSchema),
})

const parsePromptProvenanceJson = (value: string | null | undefined): PromptProvenance | null => {
  if (!value) {
    return null
  }

  try {
    const parsed = JSON.parse(value)
    const validated = promptProvenanceSchema.safeParse(parsed)
    if (!validated.success) {
      return null
    }

    return validated.data
  } catch {
    return null
  }
}

const parseRunResultSummary = (resultJson: string | null): string | null => {
  if (!resultJson) {
    return null
  }

  try {
    const parsed = JSON.parse(resultJson) as {
      summary?: unknown
    }
    return typeof parsed.summary === "string" && parsed.summary.trim().length > 0
      ? parsed.summary
      : null
  } catch {
    return null
  }
}

const resolveBackgroundOneshotStatus = (
  job: JobRecord,
  latestRun: JobRunRecord | null
): z.infer<typeof backgroundOneshotStatusSchema> => {
  if (latestRun) {
    if (latestRun.finishedAt == null) {
      return "running"
    }

    return latestRun.status
  }

  if (job.terminalState === "cancelled") {
    return "cancelled"
  }

  if (job.terminalState === "expired") {
    return "expired"
  }

  if (job.status === "running") {
    return "running"
  }

  return "queued"
}

const jobRunEntrySchema = z.object({
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

const healthResponseSchema = z.object({
  status: z.literal("ok"),
})

const listJobsResponseSchema = z.object({
  jobs: z.array(taskListRecordSchema),
})

const jobDetailsResponseSchema = z.object({
  job: jobRecordSchema,
})

const jobAuditResponseSchema = z.object({
  taskId: z.string().min(1),
  entries: z.array(taskAuditEntrySchema),
})

const jobRunsResponseSchema = z.object({
  taskId: z.string().min(1),
  total: z.number().int().min(0),
  limit: z.number().int().min(1).max(200),
  offset: z.number().int().min(0),
  runs: z.array(jobRunEntrySchema),
})

const jobRunDetailResponseSchema = z.object({
  taskId: z.string().min(1),
  run: jobRunEntrySchema,
})

const taskMutationResponseSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["created", "updated", "deleted", "run_now_scheduled"]),
  scheduledFor: z.number().int().optional(),
})

const backgroundStopSessionResultSchema = z.object({
  sessionId: z.string().trim().min(1),
  runId: z.string().trim().min(1),
  status: z.enum(["stopped", "stop_failed"]),
  errorMessage: z.string().nullable(),
})

const backgroundCancelResponseSchema = z.object({
  jobId: z.string().trim().min(1),
  outcome: z.enum(["cancelled", "already_cancelled", "already_terminal"]),
  terminalState: z.enum(["completed", "expired", "cancelled"]),
  stopSessionResults: z.array(backgroundStopSessionResultSchema),
})

const backgroundOneshotCreateResponseSchema = z.object({
  sessionId: z.string().trim().min(1),
  jobId: z.string().trim().min(1),
  status: z.literal("queued"),
  runAt: z.number().int(),
})

const backgroundOneshotStatusSchema = z.enum([
  "queued",
  "running",
  "success",
  "failed",
  "skipped",
  "cancelled",
  "expired",
])

const backgroundOneshotStatusResponseSchema = z.object({
  sessionId: z.string().trim().min(1),
  jobId: z.string().trim().min(1),
  runId: z.string().trim().min(1).nullable(),
  status: backgroundOneshotStatusSchema,
  summary: z.string().nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  startedAt: z.number().int().nullable(),
  finishedAt: z.number().int().nullable(),
})

const interactivePromptWarningSchema = z.object({
  code: z.string().trim().min(1),
  message: z.string().trim().min(1),
})

const interactivePromptResponseSchema = z.object({
  flow: z.literal("interactive"),
  surface: interactivePromptSurfaceSchema,
  media: z.enum(["chatapps", "web", "cli"]),
  routeKey: z.string().trim().min(1),
  mappingSource: z.enum(["effective", "system"]),
  systemPrompt: z.string(),
  provenance: promptProvenanceSchema,
  warnings: z.array(interactivePromptWarningSchema),
})

const promptFileEntrySchema = z.object({
  source: promptFileSourceSchema,
  relativePath: z.string().trim().min(1),
  editable: z.boolean(),
})

const promptFilesResponseSchema = z.object({
  files: z.array(promptFileEntrySchema),
})

const promptFileResponseSchema = z.object({
  file: promptFileEntrySchema.extend({
    content: z.string(),
  }),
})

const promptFileUpdateResponseSchema = z.object({
  status: z.literal("updated"),
  file: promptFileEntrySchema.extend({
    updatedAt: z.number().int(),
  }),
})

const serviceStatusSchema = z.enum(["ok", "degraded", "disabled"])

const systemServiceSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1),
  status: serviceStatusSchema,
  message: z.string().trim().min(1),
})

const systemStatusResponseSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  checkedAt: z.number().int(),
  runtime: z.object({
    version: z.string().trim().min(1),
    pid: z.number().int().min(1),
    startedAt: z.number().int(),
    uptimeSec: z.number().min(0),
  }),
  services: z.array(systemServiceSchema),
})

const systemRestartResponseSchema = z.object({
  status: z.literal("accepted"),
  requestedAt: z.number().int(),
  message: z.string().trim().min(1),
})

const notificationProfileSchema = z.object({
  timezone: z.string().nullable(),
  quietHoursStart: z.string().nullable(),
  quietHoursEnd: z.string().nullable(),
  quietMode: z.enum(["critical_only", "off"]).nullable(),
  muteUntil: z.number().int().nullable(),
  heartbeatMorning: z.string().nullable(),
  heartbeatMidday: z.string().nullable(),
  heartbeatEvening: z.string().nullable(),
  heartbeatCadenceMinutes: z.number().int().nullable(),
  heartbeatOnlyIfSignal: z.boolean(),
  interactiveContextWindowSize: z.number().int().min(5).max(200),
  contextRetentionCap: z.number().int().min(5).max(200),
  onboardingCompletedAt: z.number().int().nullable(),
  lastDigestAt: z.number().int().nullable(),
  updatedAt: z.number().int(),
})

const getNotificationProfileResponseSchema = z.object({
  profile: notificationProfileSchema,
})

const updateNotificationProfileResponseSchema = z.object({
  profile: notificationProfileSchema,
  changedFields: z.array(z.string().min(1)),
})

const unauthorizedResponseSchema = z.object({
  error: z.literal("unauthorized"),
})

const internalErrorResponseSchema = z.object({
  error: z.literal("internal_error"),
})

const serviceUnavailableResponseSchema = z.object({
  error: z.literal("service_unavailable"),
})

const validationErrorResponseSchema = z.object({
  error: z.literal("invalid_request"),
  details: z.array(z.unknown()).optional(),
  message: z.string().optional(),
})

const notFoundErrorResponseSchema = z.object({
  error: z.literal("not_found"),
  message: z.string().optional(),
})

const mutationErrorResponseSchema = z.object({
  error: z.enum(["forbidden_mutation", "state_conflict", "invalid_request", "not_found"]),
  message: z.string().min(1),
})

const selfAwarenessDecisionSchema = z.object({
  id: z.string().trim().min(1),
  source: z.enum(["task_audit", "command_audit"]),
  summary: z.string().trim().min(1),
  createdAt: z.number().int(),
  metadataJson: z.string().nullable(),
})

const selfAwarenessRiskSchema = z.object({
  id: z.string().trim().min(1),
  code: z.string().trim().min(1),
  severity: z.enum(["low", "medium", "high"]),
  message: z.string().trim().min(1),
  detectedAt: z.number().int(),
  source: z.enum(["system", "command_audit"]),
  metadataJson: z.string().nullable(),
})

const selfAwarenessLimitsSchema = z.object({
  scheduler: z.object({
    enabled: z.boolean(),
    tickMs: z.number().int().min(1_000),
    batchSize: z.number().int().min(1),
    lockLeaseMs: z.number().int().min(1_000),
  }),
  pagination: z.object({
    auditMax: z.number().int().min(1),
    runsMax: z.number().int().min(1),
    defaultListLimit: z.number().int().min(1),
  }),
  profile: z.object({
    interactiveContextWindowSize: z.object({
      min: z.number().int(),
      max: z.number().int(),
      current: z.number().int(),
    }),
    contextRetentionCap: z.object({
      min: z.number().int(),
      max: z.number().int(),
      current: z.number().int(),
    }),
  }),
})

const selfAwarenessSourceSchema = z.object({
  source: z.enum(["system_status", "task_audit", "command_audit"]),
  status: z.enum(["ok", "degraded"]),
  message: z.string().trim().min(1),
})

const selfAwarenessSnapshotResponseSchema = z.object({
  state: z.object({
    status: z.enum(["ok", "degraded"]),
    checkedAt: z.number().int(),
    runtime: z.object({
      version: z.string().trim().min(1),
      pid: z.number().int().min(1),
      startedAt: z.number().int(),
      uptimeSec: z.number().min(0),
    }),
  }),
  processes: z.array(systemServiceSchema),
  limits: selfAwarenessLimitsSchema,
  recentDecisions: z.array(selfAwarenessDecisionSchema),
  openRisks: z.array(selfAwarenessRiskSchema),
  generatedAt: z.number().int(),
  sources: z.array(selfAwarenessSourceSchema),
})

const resolveApiHost = (environment: NodeJS.ProcessEnv): string => {
  const host = environment.OTTO_EXTERNAL_API_HOST?.trim() || DEFAULT_HOST

  if (host.length === 0) {
    throw new Error("Invalid external API config: OTTO_EXTERNAL_API_HOST must be non-empty")
  }

  return host
}

const resolveApiPort = (environment: NodeJS.ProcessEnv): number => {
  const rawPort = environment.OTTO_EXTERNAL_API_PORT
  const port = rawPort ? Number(rawPort) : DEFAULT_PORT

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Invalid external API config: OTTO_EXTERNAL_API_PORT must be 1-65535")
  }

  return port
}

const resolveTaskMutationErrorResponse = (
  error: TaskMutationError
): {
  statusCode: 400 | 403 | 404 | 409
  body: {
    error: string
    message: string
  }
} => {
  if (error.code === "invalid_request") {
    return {
      statusCode: 400,
      body: {
        error: "invalid_request",
        message: error.message,
      },
    }
  }

  if (error.code === "not_found") {
    return {
      statusCode: 404,
      body: {
        error: "not_found",
        message: error.message,
      },
    }
  }

  if (error.code === "forbidden_mutation") {
    return {
      statusCode: 403,
      body: {
        error: "forbidden_mutation",
        message: error.message,
      },
    }
  }

  return {
    statusCode: 409,
    body: {
      error: "state_conflict",
      message: error.message,
    },
  }
}

const resolvePromptFileErrorResponse = (error: PromptFileAccessError) => {
  if (error.code === "invalid_path") {
    return {
      statusCode: 400,
      body: {
        error: "invalid_request",
        message: error.message,
      },
    }
  }

  if (error.code === "not_found") {
    return {
      statusCode: 404,
      body: {
        error: "not_found",
        message: error.message,
      },
    }
  }

  return {
    statusCode: 403,
    body: {
      error: "forbidden_mutation",
      message: error.message,
    },
  }
}

const writeCommandAudit = (
  commandAuditRepository: ExternalApiServerDependencies["commandAuditRepository"],
  record: {
    command: string
    status: "success" | "failed" | "denied"
    errorMessage?: string | null
    metadataJson?: string | null
    createdAt?: number
  }
): void => {
  commandAuditRepository?.insert({
    id: randomUUID(),
    command: record.command,
    lane: "interactive",
    status: record.status,
    errorMessage: record.errorMessage ?? null,
    metadataJson: record.metadataJson ?? null,
    createdAt: record.createdAt ?? Date.now(),
  })
}

/**
 * Resolves external API network settings and shared auth token so Otto can expose a
 * stable LAN-facing control plane contract without splitting credential management.
 *
 * @param ottoHome Otto home directory containing the shared API token file.
 * @param environment Optional environment override for tests.
 * @returns External API runtime configuration with shared persisted token.
 */
export const resolveExternalApiConfig = async (
  ottoHome: string,
  environment: NodeJS.ProcessEnv = process.env
): Promise<ExternalApiConfig> => {
  const host = resolveApiHost(environment)
  const port = resolveApiPort(environment)
  const tokenPath = resolveApiTokenPath(ottoHome)
  const token = await resolveOrCreateApiToken(tokenPath)

  return {
    host,
    port,
    token,
    tokenPath,
    baseUrl: `http://${host}:${port}`,
  }
}

/**
 * Builds a runtime-owned system status snapshot from process metadata and service-level
 * health markers so operators can inspect actionable runtime truth through one contract.
 *
 * @param input Runtime and service status values known by the current process.
 * @returns External system status payload suitable for `/external/system/status`.
 */
export const buildExternalSystemStatusSnapshot = (input: {
  startedAt: number
  services: ExternalSystemStatusResponse["services"]
}): ExternalSystemStatusResponse => {
  const hasDegradedService = input.services.some((service) => service.status === "degraded")

  return {
    status: hasDegradedService ? "degraded" : "ok",
    checkedAt: Date.now(),
    runtime: {
      version: getAppVersion(),
      pid: process.pid,
      startedAt: input.startedAt,
      uptimeSec: Number(process.uptime().toFixed(3)),
    },
    services: input.services,
  }
}

const buildSelfAwarenessSnapshot = (
  dependencies: ExternalApiServerDependencies,
  systemStatusProvider: () => z.infer<typeof systemStatusResponseSchema>,
  userProfileRepository: {
    get: () => UserProfileRecord | null
  }
): z.infer<typeof selfAwarenessSnapshotResponseSchema> => {
  const sources: z.infer<typeof selfAwarenessSourceSchema>[] = []

  const state = systemStatusProvider()
  sources.push({
    source: "system_status",
    status: "ok",
    message: "System status provider returned runtime snapshot",
  })

  let recentTaskAudit: TaskAuditRecord[] = []
  try {
    if (dependencies.taskAuditRepository.listRecent) {
      recentTaskAudit = dependencies.taskAuditRepository.listRecent(25)
      sources.push({
        source: "task_audit",
        status: "ok",
        message: "Task audit source is available",
      })
    } else {
      sources.push({
        source: "task_audit",
        status: "degraded",
        message: "Task audit source does not expose listRecent",
      })
    }
  } catch (error) {
    const err = error as Error
    sources.push({
      source: "task_audit",
      status: "degraded",
      message: `Task audit source failed: ${err.message}`,
    })
  }

  let recentCommandAudit: CommandAuditRecord[] = []
  try {
    if (dependencies.commandAuditRepository?.listRecent) {
      recentCommandAudit = dependencies.commandAuditRepository.listRecent(25)
      sources.push({
        source: "command_audit",
        status: "ok",
        message: "Command audit source is available",
      })
    } else {
      sources.push({
        source: "command_audit",
        status: "degraded",
        message: "Command audit source does not expose listRecent",
      })
    }
  } catch (error) {
    const err = error as Error
    sources.push({
      source: "command_audit",
      status: "degraded",
      message: `Command audit source failed: ${err.message}`,
    })
  }

  const decisions = [
    ...recentTaskAudit.map((entry) => ({
      id: entry.id,
      source: "task_audit" as const,
      summary: `Task ${entry.action} (${entry.taskId}) on ${entry.lane} lane`,
      createdAt: entry.createdAt,
      metadataJson: entry.metadataJson,
    })),
    ...recentCommandAudit.map((entry) => ({
      id: entry.id,
      source: "command_audit" as const,
      summary: `Command ${entry.command} finished with ${entry.status}`,
      createdAt: entry.createdAt,
      metadataJson: entry.metadataJson,
    })),
  ]
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, 20)

  const degradedServiceRisks = state.services
    .filter((service) => service.status === "degraded")
    .map((service) => ({
      id: `service:${service.id}`,
      code: "service_degraded",
      severity: "high" as const,
      message: `${service.label} is degraded: ${service.message}`,
      detectedAt: state.checkedAt,
      source: "system" as const,
      metadataJson: JSON.stringify({ serviceId: service.id, status: service.status }),
    }))

  const commandAuditRisks = recentCommandAudit
    .filter((entry) => entry.status === "failed" || entry.status === "denied")
    .map((entry) => ({
      id: `command:${entry.id}`,
      code: entry.status === "denied" ? "command_denied" : "command_failed",
      severity: entry.status === "denied" ? ("medium" as const) : ("high" as const),
      message: entry.errorMessage ?? `Command ${entry.command} ended with ${entry.status}`,
      detectedAt: entry.createdAt,
      source: "command_audit" as const,
      metadataJson: entry.metadataJson,
    }))

  const schedulerConfig = resolveSchedulerConfig()
  const profile = resolveNotificationProfile(userProfileRepository)

  return selfAwarenessSnapshotResponseSchema.parse({
    state: {
      status: state.status,
      checkedAt: state.checkedAt,
      runtime: state.runtime,
    },
    processes: state.services,
    limits: {
      scheduler: {
        enabled: schedulerConfig.enabled,
        tickMs: schedulerConfig.tickMs,
        batchSize: schedulerConfig.batchSize,
        lockLeaseMs: schedulerConfig.lockLeaseMs,
      },
      pagination: {
        auditMax: 200,
        runsMax: 200,
        defaultListLimit: 20,
      },
      profile: {
        interactiveContextWindowSize: {
          min: 5,
          max: 200,
          current: profile.interactiveContextWindowSize,
        },
        contextRetentionCap: {
          min: 5,
          max: 200,
          current: profile.contextRetentionCap,
        },
      },
    },
    recentDecisions: decisions,
    openRisks: [...degradedServiceRisks, ...commandAuditRisks],
    generatedAt: Date.now(),
    sources,
  })
}

/**
 * Builds the LAN-facing external API server used by the control-plane process and future
 * non-OpenCode clients while preserving Otto runtime ownership of source-of-truth data.
 *
 * @param dependencies External API configuration, logger, and persistence dependencies.
 * @returns Fastify instance ready for injection tests or network listen.
 */
export const buildExternalApiServer = (
  dependencies: ExternalApiServerDependencies
): FastifyInstance => {
  const app = Fastify({ logger: false })
  const commandAuditRepository = dependencies.commandAuditRepository
  const systemStatusProvider =
    dependencies.systemStatusProvider ??
    (() => {
      return buildExternalSystemStatusSnapshot({
        startedAt: Date.now(),
        services: [
          {
            id: "runtime",
            label: "Otto Runtime",
            status: "ok",
            message: "Runtime process is active",
          },
        ],
      })
    })
  const restartRuntime = dependencies.restartRuntime ?? (async () => undefined)
  let fallbackProfile = resolveNotificationProfile({
    get: () => null,
  })
  const userProfileRepository =
    dependencies.userProfileRepository ??
    ({
      get: () => fallbackProfile,
      upsert: (record) => {
        fallbackProfile = record
      },
    } as const)
  const modelManagement = dependencies.modelManagement
  const externalSecurity = [{ bearerAuth: [] }]
  const openApiOperations: OpenApiOperationSpec[] = [
    {
      method: "get",
      path: "/external/health",
      tags: ["System"],
      summary: "External API health check",
      security: externalSecurity,
      responses: {
        200: { description: "Health status", schema: healthResponseSchema },
        401: { description: "Unauthorized", schema: unauthorizedResponseSchema },
      },
    },
    {
      method: "get",
      path: "/external/system/status",
      tags: ["System"],
      summary: "Current runtime and service status",
      security: externalSecurity,
      responses: {
        200: { description: "System status", schema: systemStatusResponseSchema },
        401: { description: "Unauthorized", schema: unauthorizedResponseSchema },
        500: { description: "Internal error", schema: internalErrorResponseSchema },
      },
    },
    {
      method: "post",
      path: "/external/system/restart",
      tags: ["System"],
      summary: "Request runtime restart",
      security: externalSecurity,
      responses: {
        202: { description: "Restart accepted", schema: systemRestartResponseSchema },
        401: { description: "Unauthorized", schema: unauthorizedResponseSchema },
        500: { description: "Internal error", schema: internalErrorResponseSchema },
      },
    },
    {
      method: "get",
      path: "/external/self-awareness/live",
      tags: ["System"],
      summary: "Live self-awareness snapshot",
      description:
        "Returns current runtime state, active process statuses, operational limits, recent decisions, and open risks.",
      security: externalSecurity,
      responses: {
        200: {
          description: "Self-awareness snapshot",
          schema: selfAwarenessSnapshotResponseSchema,
        },
        401: { description: "Unauthorized", schema: unauthorizedResponseSchema },
        500: { description: "Internal error", schema: internalErrorResponseSchema },
      },
    },
    {
      method: "get",
      path: "/external/settings/notification-profile",
      tags: ["Settings"],
      summary: "Read notification profile",
      security: externalSecurity,
      responses: {
        200: { description: "Notification profile", schema: getNotificationProfileResponseSchema },
        401: { description: "Unauthorized", schema: unauthorizedResponseSchema },
        500: { description: "Internal error", schema: internalErrorResponseSchema },
      },
    },
    {
      method: "put",
      path: "/external/settings/notification-profile",
      tags: ["Settings"],
      summary: "Update notification profile",
      security: externalSecurity,
      requestBody: { schema: notificationProfileUpdateSchema },
      responses: {
        200: {
          description: "Updated notification profile",
          schema: updateNotificationProfileResponseSchema,
        },
        400: { description: "Invalid request", schema: validationErrorResponseSchema },
        401: { description: "Unauthorized", schema: unauthorizedResponseSchema },
        500: { description: "Internal error", schema: internalErrorResponseSchema },
      },
    },
    {
      method: "get",
      path: "/external/prompts/interactive",
      tags: ["Prompts"],
      summary: "Resolve effective interactive system prompt",
      security: externalSecurity,
      query: interactivePromptQuerySchema,
      responses: {
        200: { description: "Resolved prompt", schema: interactivePromptResponseSchema },
        400: { description: "Invalid request", schema: validationErrorResponseSchema },
        401: { description: "Unauthorized", schema: unauthorizedResponseSchema },
        500: { description: "Internal error", schema: internalErrorResponseSchema },
      },
    },
    {
      method: "get",
      path: "/external/prompts/files",
      tags: ["Prompts"],
      summary: "List managed prompt files",
      security: externalSecurity,
      responses: {
        200: { description: "Prompt file list", schema: promptFilesResponseSchema },
        401: { description: "Unauthorized", schema: unauthorizedResponseSchema },
        500: { description: "Internal error", schema: internalErrorResponseSchema },
      },
    },
    {
      method: "get",
      path: "/external/prompts/file",
      tags: ["Prompts"],
      summary: "Read managed prompt file",
      security: externalSecurity,
      query: promptFileQuerySchema,
      responses: {
        200: { description: "Prompt file content", schema: promptFileResponseSchema },
        400: { description: "Invalid request", schema: validationErrorResponseSchema },
        401: { description: "Unauthorized", schema: unauthorizedResponseSchema },
        403: { description: "Forbidden mutation", schema: mutationErrorResponseSchema },
        404: { description: "Prompt file not found", schema: notFoundErrorResponseSchema },
        500: { description: "Internal error", schema: internalErrorResponseSchema },
      },
    },
    {
      method: "put",
      path: "/external/prompts/file",
      tags: ["Prompts"],
      summary: "Write managed prompt file",
      security: externalSecurity,
      requestBody: { schema: updatePromptFileRequestSchema },
      responses: {
        200: { description: "Prompt file updated", schema: promptFileUpdateResponseSchema },
        400: { description: "Invalid request", schema: validationErrorResponseSchema },
        401: { description: "Unauthorized", schema: unauthorizedResponseSchema },
        403: { description: "Forbidden mutation", schema: mutationErrorResponseSchema },
        404: { description: "Prompt file not found", schema: notFoundErrorResponseSchema },
        500: { description: "Internal error", schema: internalErrorResponseSchema },
      },
    },
    {
      method: "get",
      path: "/external/models/catalog",
      tags: ["Models"],
      summary: "Get model catalog snapshot",
      security: externalSecurity,
      responses: {
        200: { description: "Catalog snapshot", schema: externalModelCatalogResponseSchema },
        401: { description: "Unauthorized", schema: unauthorizedResponseSchema },
        503: { description: "Service unavailable", schema: serviceUnavailableResponseSchema },
      },
    },
    {
      method: "post",
      path: "/external/models/refresh",
      tags: ["Models"],
      summary: "Refresh model catalog snapshot",
      security: externalSecurity,
      responses: {
        200: { description: "Refreshed snapshot", schema: externalModelRefreshResponseSchema },
        401: { description: "Unauthorized", schema: unauthorizedResponseSchema },
        503: { description: "Service unavailable", schema: serviceUnavailableResponseSchema },
      },
    },
    {
      method: "get",
      path: "/external/models/defaults",
      tags: ["Models"],
      summary: "Get model flow defaults",
      security: externalSecurity,
      responses: {
        200: { description: "Model defaults", schema: externalModelDefaultsResponseSchema },
        401: { description: "Unauthorized", schema: unauthorizedResponseSchema },
        503: { description: "Service unavailable", schema: serviceUnavailableResponseSchema },
        500: { description: "Internal error", schema: internalErrorResponseSchema },
      },
    },
    {
      method: "put",
      path: "/external/models/defaults",
      tags: ["Models"],
      summary: "Update model flow defaults",
      security: externalSecurity,
      requestBody: { schema: externalModelDefaultsUpdateRequestSchema },
      responses: {
        200: { description: "Updated defaults", schema: externalModelDefaultsResponseSchema },
        400: { description: "Invalid request", schema: validationErrorResponseSchema },
        401: { description: "Unauthorized", schema: unauthorizedResponseSchema },
        503: { description: "Service unavailable", schema: serviceUnavailableResponseSchema },
        500: { description: "Internal error", schema: internalErrorResponseSchema },
      },
    },
    {
      method: "get",
      path: "/external/jobs",
      tags: ["Jobs"],
      summary: "List scheduled or interactive jobs",
      security: externalSecurity,
      query: listJobsQuerySchema,
      responses: {
        200: { description: "Jobs list", schema: listJobsResponseSchema },
        400: { description: "Invalid request", schema: validationErrorResponseSchema },
        401: { description: "Unauthorized", schema: unauthorizedResponseSchema },
      },
    },
    {
      method: "post",
      path: "/external/jobs",
      tags: ["Jobs"],
      summary: "Create job",
      security: externalSecurity,
      requestBody: { schema: taskCreateInputSchema },
      responses: {
        201: { description: "Job created", schema: taskMutationResponseSchema },
        400: { description: "Invalid request", schema: validationErrorResponseSchema },
        401: { description: "Unauthorized", schema: unauthorizedResponseSchema },
        403: { description: "Forbidden", schema: mutationErrorResponseSchema },
        404: { description: "Not found", schema: notFoundErrorResponseSchema },
        409: { description: "State conflict", schema: mutationErrorResponseSchema },
        500: { description: "Internal error", schema: internalErrorResponseSchema },
      },
    },
    {
      method: "delete",
      path: "/external/jobs/:id",
      tags: ["Jobs"],
      summary: "Delete job",
      security: externalSecurity,
      pathParams: mutateJobParamsSchema,
      responses: {
        200: { description: "Job deleted", schema: taskMutationResponseSchema },
        400: { description: "Invalid request", schema: validationErrorResponseSchema },
        401: { description: "Unauthorized", schema: unauthorizedResponseSchema },
        403: { description: "Forbidden", schema: mutationErrorResponseSchema },
        404: { description: "Not found", schema: notFoundErrorResponseSchema },
        409: { description: "State conflict", schema: mutationErrorResponseSchema },
        500: { description: "Internal error", schema: internalErrorResponseSchema },
      },
    },
    {
      method: "post",
      path: "/external/jobs/:id/run-now",
      tags: ["Jobs"],
      summary: "Run job immediately",
      security: externalSecurity,
      pathParams: mutateJobParamsSchema,
      responses: {
        200: { description: "Run-now scheduled", schema: taskMutationResponseSchema },
        400: { description: "Invalid request", schema: validationErrorResponseSchema },
        401: { description: "Unauthorized", schema: unauthorizedResponseSchema },
        403: { description: "Forbidden", schema: mutationErrorResponseSchema },
        404: { description: "Not found", schema: notFoundErrorResponseSchema },
        409: { description: "State conflict", schema: mutationErrorResponseSchema },
        500: { description: "Internal error", schema: internalErrorResponseSchema },
      },
    },
    {
      method: "get",
      path: "/external/jobs/:id",
      tags: ["Jobs"],
      summary: "Get job details",
      security: externalSecurity,
      pathParams: getJobParamsSchema,
      responses: {
        200: { description: "Job details", schema: jobDetailsResponseSchema },
        400: { description: "Invalid request", schema: validationErrorResponseSchema },
        401: { description: "Unauthorized", schema: unauthorizedResponseSchema },
        404: { description: "Not found", schema: notFoundErrorResponseSchema },
        500: { description: "Internal error", schema: internalErrorResponseSchema },
      },
    },
    {
      method: "get",
      path: "/external/jobs/:id/audit",
      tags: ["Jobs"],
      summary: "Get recent job audit entries",
      security: externalSecurity,
      pathParams: getJobParamsSchema,
      query: listAuditQuerySchema,
      responses: {
        200: { description: "Job audit entries", schema: jobAuditResponseSchema },
        400: { description: "Invalid request", schema: validationErrorResponseSchema },
        401: { description: "Unauthorized", schema: unauthorizedResponseSchema },
        404: { description: "Not found", schema: notFoundErrorResponseSchema },
        500: { description: "Internal error", schema: internalErrorResponseSchema },
      },
    },
    {
      method: "get",
      path: "/external/jobs/:id/runs",
      tags: ["Jobs"],
      summary: "List job runs",
      security: externalSecurity,
      pathParams: getJobParamsSchema,
      query: listRunsQuerySchema,
      responses: {
        200: { description: "Job run list", schema: jobRunsResponseSchema },
        400: { description: "Invalid request", schema: validationErrorResponseSchema },
        401: { description: "Unauthorized", schema: unauthorizedResponseSchema },
        404: { description: "Not found", schema: notFoundErrorResponseSchema },
        500: { description: "Internal error", schema: internalErrorResponseSchema },
      },
    },
    {
      method: "get",
      path: "/external/jobs/:id/runs/:runId",
      tags: ["Jobs"],
      summary: "Get single job run details",
      security: externalSecurity,
      pathParams: getRunParamsSchema,
      responses: {
        200: { description: "Job run details", schema: jobRunDetailResponseSchema },
        400: { description: "Invalid request", schema: validationErrorResponseSchema },
        401: { description: "Unauthorized", schema: unauthorizedResponseSchema },
        404: { description: "Not found", schema: notFoundErrorResponseSchema },
        500: { description: "Internal error", schema: internalErrorResponseSchema },
      },
    },
    {
      method: "post",
      path: "/external/background-jobs/oneshot",
      tags: ["BackgroundJobs"],
      summary: "Create interactive one-shot background job",
      security: externalSecurity,
      requestBody: { schema: createBackgroundOneshotRequestSchema },
      responses: {
        202: {
          description: "Background run queued",
          schema: backgroundOneshotCreateResponseSchema,
        },
        400: { description: "Invalid request", schema: validationErrorResponseSchema },
        401: { description: "Unauthorized", schema: unauthorizedResponseSchema },
        500: { description: "Internal error", schema: internalErrorResponseSchema },
      },
    },
    {
      method: "get",
      path: "/external/background-jobs/oneshot/:sessionId/status",
      tags: ["BackgroundJobs"],
      summary: "Get one-shot background session status",
      security: externalSecurity,
      pathParams: getBackgroundOneshotStatusParamsSchema,
      responses: {
        200: { description: "Background status", schema: backgroundOneshotStatusResponseSchema },
        400: { description: "Invalid request", schema: validationErrorResponseSchema },
        401: { description: "Unauthorized", schema: unauthorizedResponseSchema },
        404: { description: "Not found", schema: notFoundErrorResponseSchema },
        500: { description: "Internal error", schema: internalErrorResponseSchema },
      },
    },
    {
      method: "post",
      path: "/external/background-jobs/:id/cancel",
      tags: ["BackgroundJobs"],
      summary: "Cancel background one-shot job",
      security: externalSecurity,
      pathParams: cancelBackgroundJobParamsSchema,
      requestBody: { schema: cancelBackgroundJobRequestSchema, required: false },
      responses: {
        200: { description: "Cancel outcome", schema: backgroundCancelResponseSchema },
        400: { description: "Invalid request", schema: validationErrorResponseSchema },
        401: { description: "Unauthorized", schema: unauthorizedResponseSchema },
        404: { description: "Not found", schema: notFoundErrorResponseSchema },
        500: { description: "Internal error", schema: internalErrorResponseSchema },
      },
    },
  ]

  const buildExternalOpenApiDocument = () => {
    return buildOpenApiDocument({
      title: "Otto External API",
      version: getAppVersion(),
      description:
        "LAN-facing API for Otto runtime control and observability. This API manages runtime status, jobs, prompts, model defaults, and interactive background one-shot runs. It does not execute arbitrary shell commands or provide direct database access.",
      tags: [
        { name: "System", description: "Runtime status, restart, and self-awareness snapshots" },
        { name: "Settings", description: "User notification policy settings" },
        { name: "Prompts", description: "Interactive prompt resolution and file management" },
        { name: "Models", description: "Model catalog and flow default management" },
        { name: "Jobs", description: "Scheduled and operator-managed job lifecycle" },
        {
          name: "BackgroundJobs",
          description:
            "Interactive background one-shot runs. POST requests attempt immediate execution and status is polled via session id.",
        },
      ],
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
        },
      },
      operations: openApiOperations,
    })
  }

  app.addHook("onRequest", async (request, reply) => {
    const url = request.url
    const pathname = url.split("?", 1)[0] ?? url
    if (
      pathname === EXTERNAL_OPENAPI_JSON_PATH ||
      pathname.startsWith(EXTERNAL_OPENAPI_UI_PATH) ||
      pathname.startsWith(`${EXTERNAL_OPENAPI_UI_PATH}/`)
    ) {
      return
    }

    const token = extractBearerToken(request.headers.authorization)
    if (!token || token !== dependencies.config.token) {
      dependencies.logger.warn(
        {
          route: request.url,
          hasAuthorization: Boolean(request.headers.authorization),
        },
        "External API denied request"
      )
      return reply.code(401).send({ error: "unauthorized" })
    }
  })

  app.get(EXTERNAL_OPENAPI_JSON_PATH, async (_request, reply) => {
    return reply.code(200).send(buildExternalOpenApiDocument())
  })

  app.get(EXTERNAL_OPENAPI_UI_PATH, async (_request, reply) => {
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Otto External API Docs</title><link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"></head><body><div id="swagger-ui"></div><script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script><script>window.ui=SwaggerUIBundle({url:'${EXTERNAL_OPENAPI_JSON_PATH}',dom_id:'#swagger-ui',deepLinking:true,docExpansion:'list'})</script></body></html>`
    return reply.type("text/html").code(200).send(html)
  })

  app.get("/external/health", async (_request, reply) => {
    return reply.code(200).send(healthResponseSchema.parse({ status: "ok" }))
  })

  app.get("/external/system/status", async (_request, reply) => {
    try {
      const snapshot = systemStatusResponseSchema.parse(systemStatusProvider())
      return reply.code(200).send(snapshot)
    } catch (error) {
      const err = error as Error
      dependencies.logger.error({ error: err.message }, "External API system status failed")
      return reply.code(500).send({ error: "internal_error" })
    }
  })

  app.get("/external/self-awareness/live", async (_request, reply) => {
    try {
      const snapshot = buildSelfAwarenessSnapshot(
        dependencies,
        () => systemStatusResponseSchema.parse(systemStatusProvider()),
        userProfileRepository
      )
      return reply.code(200).send(snapshot)
    } catch (error) {
      const err = error as Error
      dependencies.logger.error(
        { error: err.message },
        "External API self-awareness snapshot failed"
      )
      return reply.code(500).send({ error: "internal_error" })
    }
  })

  app.post("/external/system/restart", async (_request, reply) => {
    try {
      const requestedAt = Date.now()
      await restartRuntime()

      writeCommandAudit(commandAuditRepository, {
        command: "external_system_restart",
        status: "success",
        metadataJson: JSON.stringify({ source: "external_api", requestedAt }),
        createdAt: requestedAt,
      })

      return reply.code(202).send(
        systemRestartResponseSchema.parse({
          status: "accepted",
          requestedAt,
          message: "Runtime restart requested",
        })
      )
    } catch (error) {
      const err = error as Error
      writeCommandAudit(commandAuditRepository, {
        command: "external_system_restart",
        status: "failed",
        errorMessage: err.message,
        metadataJson: JSON.stringify({ source: "external_api" }),
      })
      dependencies.logger.error({ error: err.message }, "External API runtime restart failed")
      return reply.code(500).send({ error: "internal_error" })
    }
  })

  app.get("/external/settings/notification-profile", async (_request, reply) => {
    try {
      const profile = resolveNotificationProfile(userProfileRepository)

      return reply.code(200).send(
        getNotificationProfileResponseSchema.parse({
          profile,
        })
      )
    } catch (error) {
      const err = error as Error
      dependencies.logger.error(
        { error: err.message },
        "External API notification profile get failed"
      )
      return reply.code(500).send({ error: "internal_error" })
    }
  })

  app.put("/external/settings/notification-profile", async (request, reply) => {
    try {
      const payload = notificationProfileUpdateSchema.parse(request.body)
      const now = Date.now()
      const existing = resolveNotificationProfile(userProfileRepository)
      const merged = applyNotificationProfileUpdate(existing, payload, now)
      const changedFields = diffNotificationProfileFields(existing, merged)

      userProfileRepository.upsert(merged)
      writeCommandAudit(commandAuditRepository, {
        command: "set_notification_policy",
        status: "success",
        metadataJson: JSON.stringify({
          source: "external_api",
          changedFields,
        }),
        createdAt: now,
      })

      return reply.code(200).send(
        updateNotificationProfileResponseSchema.parse({
          profile: merged,
          changedFields,
        })
      )
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.code(400).send({ error: "invalid_request", details: error.issues })
      }

      const err = error as Error
      writeCommandAudit(commandAuditRepository, {
        command: "set_notification_policy",
        status: "failed",
        errorMessage: err.message,
        metadataJson: JSON.stringify({
          source: "external_api",
        }),
      })
      dependencies.logger.error(
        { error: err.message },
        "External API notification profile set failed"
      )
      return reply.code(500).send({ error: "internal_error" })
    }
  })

  app.get("/external/prompts/interactive", async (request, reply) => {
    if (!dependencies.promptManagement?.resolveInteractiveSystemPrompt) {
      return reply.code(503).send({ error: "service_unavailable" })
    }

    try {
      const query = interactivePromptQuerySchema.parse(request.query)
      const resolved = await dependencies.promptManagement.resolveInteractiveSystemPrompt(
        query.surface
      )

      return reply.code(200).send(
        interactivePromptResponseSchema.parse({
          flow: resolved.flow,
          surface: resolved.surface,
          media: resolved.media,
          routeKey: resolved.routeKey,
          mappingSource: resolved.mappingSource,
          systemPrompt: resolved.systemPrompt,
          provenance: resolved.provenance,
          warnings: resolved.warnings,
        })
      )
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.code(400).send({ error: "invalid_request", details: error.issues })
      }

      const err = error as Error
      dependencies.logger.error(
        { error: err.message },
        "External API interactive prompt resolution failed"
      )
      return reply.code(500).send({ error: "internal_error" })
    }
  })

  app.get("/external/prompts/files", async (_request, reply) => {
    if (!dependencies.promptManagement?.listPromptFiles) {
      return reply.code(503).send({ error: "service_unavailable" })
    }

    try {
      const files = await dependencies.promptManagement.listPromptFiles()
      return reply.code(200).send(promptFilesResponseSchema.parse({ files }))
    } catch (error) {
      const err = error as Error
      dependencies.logger.error({ error: err.message }, "External API prompt file listing failed")
      return reply.code(500).send({ error: "internal_error" })
    }
  })

  app.get("/external/prompts/file", async (request, reply) => {
    if (!dependencies.promptManagement?.readPromptFile) {
      return reply.code(503).send({ error: "service_unavailable" })
    }

    try {
      const query = promptFileQuerySchema.parse(request.query)
      const file = await dependencies.promptManagement.readPromptFile({
        source: query.source,
        relativePath: query.path,
      })

      return reply.code(200).send(promptFileResponseSchema.parse({ file }))
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.code(400).send({ error: "invalid_request", details: error.issues })
      }

      if (error instanceof PromptFileAccessError) {
        const failure = resolvePromptFileErrorResponse(error)
        return reply.code(failure.statusCode).send(failure.body)
      }

      const err = error as Error
      dependencies.logger.error({ error: err.message }, "External API prompt file read failed")
      return reply.code(500).send({ error: "internal_error" })
    }
  })

  app.put("/external/prompts/file", async (request, reply) => {
    if (!dependencies.promptManagement?.writePromptFile) {
      return reply.code(503).send({ error: "service_unavailable" })
    }

    try {
      const payload = updatePromptFileRequestSchema.parse(request.body)
      const file = await dependencies.promptManagement.writePromptFile({
        source: payload.source,
        relativePath: payload.path,
        content: payload.content,
      })

      return reply.code(200).send(promptFileUpdateResponseSchema.parse({ status: "updated", file }))
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.code(400).send({ error: "invalid_request", details: error.issues })
      }

      if (error instanceof PromptFileAccessError) {
        const failure = resolvePromptFileErrorResponse(error)
        return reply.code(failure.statusCode).send(failure.body)
      }

      const err = error as Error
      dependencies.logger.error({ error: err.message }, "External API prompt file write failed")
      return reply.code(500).send({ error: "internal_error" })
    }
  })

  app.get("/external/models/catalog", async (_request, reply) => {
    if (!modelManagement) {
      return reply.code(503).send({ error: "service_unavailable" })
    }

    try {
      const snapshot = modelManagement.getCatalogSnapshot()
      return reply.code(200).send(
        externalModelCatalogResponseSchema.parse({
          models: snapshot.refs,
          updatedAt: snapshot.updatedAt,
          source: snapshot.source,
        })
      )
    } catch (error) {
      const err = error as Error
      if (err.message.includes("not ready")) {
        return reply.code(503).send({ error: "service_unavailable" })
      }

      dependencies.logger.error({ error: err.message }, "External API model catalog read failed")
      return reply.code(500).send({ error: "internal_error" })
    }
  })

  app.post("/external/models/refresh", async (_request, reply) => {
    if (!modelManagement) {
      return reply.code(503).send({ error: "service_unavailable" })
    }

    try {
      const snapshot = await modelManagement.refreshCatalog()
      if (snapshot.updatedAt == null) {
        throw new Error("Model catalog refresh did not provide updatedAt")
      }

      writeCommandAudit(commandAuditRepository, {
        command: "external_models_refresh",
        status: "success",
        metadataJson: JSON.stringify({
          source: "external_api",
          updatedAt: snapshot.updatedAt,
          count: snapshot.refs.length,
          catalogSource: snapshot.source,
        }),
      })

      dependencies.logger.info(
        {
          updatedAt: snapshot.updatedAt,
          count: snapshot.refs.length,
          source: snapshot.source,
        },
        "External API model catalog refreshed"
      )

      return reply.code(200).send(
        externalModelRefreshResponseSchema.parse({
          status: "ok",
          updatedAt: snapshot.updatedAt,
          count: snapshot.refs.length,
        })
      )
    } catch (error) {
      const err = error as Error
      if (err.message.includes("not ready")) {
        return reply.code(503).send({ error: "service_unavailable" })
      }

      writeCommandAudit(commandAuditRepository, {
        command: "external_models_refresh",
        status: "failed",
        errorMessage: err.message,
        metadataJson: JSON.stringify({ source: "external_api" }),
      })
      dependencies.logger.error({ error: err.message }, "External API model refresh failed")
      return reply.code(500).send({ error: "internal_error" })
    }
  })

  app.get("/external/models/defaults", async (_request, reply) => {
    if (!modelManagement) {
      return reply.code(503).send({ error: "service_unavailable" })
    }

    try {
      const flowDefaults = await modelManagement.getFlowDefaults()
      return reply.code(200).send(externalModelDefaultsResponseSchema.parse({ flowDefaults }))
    } catch (error) {
      const err = error as Error
      dependencies.logger.error({ error: err.message }, "External API model defaults read failed")
      return reply.code(500).send({ error: "internal_error" })
    }
  })

  app.put("/external/models/defaults", async (request, reply) => {
    if (!modelManagement) {
      return reply.code(503).send({ error: "service_unavailable" })
    }

    try {
      const payload = externalModelDefaultsUpdateRequestSchema.parse(request.body)
      const flowDefaults = await modelManagement.updateFlowDefaults(payload.flowDefaults)
      await restartRuntime()

      writeCommandAudit(commandAuditRepository, {
        command: "external_models_defaults_update",
        status: "success",
        metadataJson: JSON.stringify({
          source: "external_api",
          flowDefaults,
          runtimeRestartRequested: true,
        }),
      })

      dependencies.logger.info(
        { flowDefaults, runtimeRestartRequested: true },
        "External API model defaults updated"
      )

      return reply.code(200).send(externalModelDefaultsResponseSchema.parse({ flowDefaults }))
    } catch (error) {
      if (error instanceof ZodError) {
        writeCommandAudit(commandAuditRepository, {
          command: "external_models_defaults_update",
          status: "failed",
          errorMessage: "invalid_request",
          metadataJson: JSON.stringify({ source: "external_api" }),
        })

        return reply.code(400).send({ error: "invalid_request", details: error.issues })
      }

      const err = error as Error
      writeCommandAudit(commandAuditRepository, {
        command: "external_models_defaults_update",
        status: "failed",
        errorMessage: err.message,
        metadataJson: JSON.stringify({ source: "external_api" }),
      })
      dependencies.logger.error({ error: err.message }, "External API model defaults update failed")
      return reply.code(500).send({ error: "internal_error" })
    }
  })

  app.get("/external/jobs", async (request, reply) => {
    try {
      const query = listJobsQuerySchema.parse(request.query)
      const jobs = listTasksForLane(dependencies.jobsRepository, query.lane)
        .filter((job) => {
          if (query.lane === "interactive") {
            return job.type === INTERACTIVE_BACKGROUND_ONESHOT_JOB_TYPE
          }

          return job.type !== INTERACTIVE_BACKGROUND_ONESHOT_JOB_TYPE
        })
        .map(mapTaskListForExternal)
        .filter((job) => {
          if (!query.type) {
            return true
          }

          return job.type === query.type
        })

      return reply.code(200).send(
        listJobsResponseSchema.parse({
          jobs,
        })
      )
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.code(400).send({ error: "invalid_request", details: error.issues })
      }

      const err = error as Error
      dependencies.logger.error({ error: err.message }, "External API job list failed")
      return reply.code(500).send({ error: "internal_error" })
    }
  })

  app.post("/external/background-jobs/oneshot", async (request, reply) => {
    try {
      if (
        !dependencies.executeBackgroundJobNow ||
        !(dependencies.isBackgroundExecutionReady?.() ?? true)
      ) {
        return reply.code(503).send({
          error: "service_unavailable",
          message: "Immediate background execution is unavailable",
        })
      }

      const payload = createBackgroundOneshotRequestSchema.parse(request.body)
      const sessionId = randomUUID()
      const created = spawnInteractiveBackgroundJob(
        {
          jobsRepository: dependencies.jobsRepository,
          taskAuditRepository: dependencies.taskAuditRepository,
        },
        {
          jobId: sessionId,
          sessionId,
          request: payload.prompt,
          prompt: payload.prompt,
          content: payload.content,
          actor: "control_plane",
          source: "external_api",
        }
      )

      void dependencies.executeBackgroundJobNow(created.jobId).catch((error) => {
        const err = error as Error
        dependencies.logger.error(
          {
            jobId: created.jobId,
            sessionId: created.sessionId,
            error: err.message,
          },
          "External API immediate background execution dispatch failed"
        )
      })

      return reply.code(202).send(
        backgroundOneshotCreateResponseSchema.parse({
          sessionId: created.sessionId,
          jobId: created.jobId,
          status: created.status,
          runAt: created.runAt,
        })
      )
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.code(400).send({ error: "invalid_request", details: error.issues })
      }

      if (error instanceof TaskMutationError) {
        const failure = resolveTaskMutationErrorResponse(error)
        return reply.code(failure.statusCode).send(failure.body)
      }

      const err = error as Error
      dependencies.logger.error({ error: err.message }, "External API oneshot create failed")
      return reply.code(500).send({ error: "internal_error" })
    }
  })

  app.get("/external/background-jobs/oneshot/:sessionId/status", async (request, reply) => {
    try {
      const params = getBackgroundOneshotStatusParamsSchema.parse(request.params)
      const job = getTaskById(dependencies.jobsRepository, params.sessionId)

      if (!job || job.type !== INTERACTIVE_BACKGROUND_ONESHOT_JOB_TYPE) {
        return reply.code(404).send({ error: "not_found", message: "Background run not found" })
      }

      const latestRun = dependencies.jobsRepository.listRunsByJobId(job.id, {
        limit: 1,
        offset: 0,
      })[0]

      const status = resolveBackgroundOneshotStatus(job, latestRun ?? null)
      const errorCode = latestRun?.errorCode ?? null
      const errorMessage = latestRun?.errorMessage ?? job.terminalReason ?? null
      const summary = latestRun ? parseRunResultSummary(latestRun.resultJson) : null

      return reply.code(200).send(
        backgroundOneshotStatusResponseSchema.parse({
          sessionId: params.sessionId,
          jobId: job.id,
          runId: latestRun?.id ?? null,
          status,
          summary,
          errorCode,
          errorMessage,
          startedAt: latestRun?.startedAt ?? null,
          finishedAt: latestRun?.finishedAt ?? null,
        })
      )
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.code(400).send({ error: "invalid_request", details: error.issues })
      }

      const err = error as Error
      dependencies.logger.error({ error: err.message }, "External API oneshot status failed")
      return reply.code(500).send({ error: "internal_error" })
    }
  })

  app.post("/external/background-jobs/:id/cancel", async (request, reply) => {
    try {
      const params = cancelBackgroundJobParamsSchema.parse(request.params)
      const payload = cancelBackgroundJobRequestSchema.parse(request.body ?? {})

      if (!dependencies.jobRunSessionsRepository) {
        return reply.code(503).send({
          error: "service_unavailable",
          message: "Background cancellation controls are unavailable",
        })
      }

      const result = await cancelInteractiveBackgroundJob(
        {
          jobsRepository: dependencies.jobsRepository,
          jobRunSessionsRepository: dependencies.jobRunSessionsRepository,
          taskAuditRepository: dependencies.taskAuditRepository,
          sessionController: dependencies.sessionController,
        },
        {
          jobId: params.id,
          reason: payload.reason,
          actor: "control_plane",
          source: "external_api",
        }
      )

      if (!result) {
        return reply.code(404).send({ error: "not_found", message: "Task not found" })
      }

      return reply.code(200).send(backgroundCancelResponseSchema.parse(result))
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.code(400).send({ error: "invalid_request", details: error.issues })
      }

      const err = error as Error
      dependencies.logger.error(
        {
          error: err.message,
          taskType: INTERACTIVE_BACKGROUND_ONESHOT_JOB_TYPE,
        },
        "External API background cancel failed"
      )
      return reply.code(500).send({ error: "internal_error" })
    }
  })

  app.post("/external/jobs", async (request, reply) => {
    try {
      const payload = taskCreateInputSchema.parse(request.body)
      const mutation = createTaskMutation(
        {
          jobsRepository: dependencies.jobsRepository,
          taskAuditRepository: dependencies.taskAuditRepository,
        },
        payload,
        {
          lane: "scheduled",
          actor: "control_plane",
          source: "external_api",
        }
      )

      return reply.code(201).send(taskMutationResponseSchema.parse(mutation))
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.code(400).send({ error: "invalid_request", details: error.issues })
      }

      if (error instanceof TaskMutationError) {
        const failure = resolveTaskMutationErrorResponse(error)
        return reply.code(failure.statusCode).send(failure.body)
      }

      const err = error as Error
      dependencies.logger.error({ error: err.message }, "External API job create failed")
      return reply.code(500).send({ error: "internal_error" })
    }
  })

  app.patch("/external/jobs/:id", async (request, reply) => {
    try {
      const params = mutateJobParamsSchema.parse(request.params)
      const payload = taskUpdateInputSchema.parse(request.body)

      const mutation = updateTaskMutation(
        {
          jobsRepository: dependencies.jobsRepository,
          taskAuditRepository: dependencies.taskAuditRepository,
        },
        params.id,
        payload,
        {
          lane: "scheduled",
          actor: "control_plane",
          source: "external_api",
        }
      )

      return reply.code(200).send(taskMutationResponseSchema.parse(mutation))
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.code(400).send({ error: "invalid_request", details: error.issues })
      }

      if (error instanceof TaskMutationError) {
        const failure = resolveTaskMutationErrorResponse(error)
        return reply.code(failure.statusCode).send(failure.body)
      }

      const err = error as Error
      dependencies.logger.error({ error: err.message }, "External API job update failed")
      return reply.code(500).send({ error: "internal_error" })
    }
  })

  app.delete("/external/jobs/:id", async (request, reply) => {
    try {
      const params = mutateJobParamsSchema.parse(request.params)
      const payload = taskDeleteInputSchema.parse(request.body ?? {})

      const mutation = deleteTaskMutation(
        {
          jobsRepository: dependencies.jobsRepository,
          taskAuditRepository: dependencies.taskAuditRepository,
        },
        params.id,
        payload,
        {
          lane: "scheduled",
          actor: "control_plane",
          source: "external_api",
        }
      )

      return reply.code(200).send(taskMutationResponseSchema.parse(mutation))
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.code(400).send({ error: "invalid_request", details: error.issues })
      }

      if (error instanceof TaskMutationError) {
        const failure = resolveTaskMutationErrorResponse(error)
        return reply.code(failure.statusCode).send(failure.body)
      }

      const err = error as Error
      dependencies.logger.error({ error: err.message }, "External API job delete failed")
      return reply.code(500).send({ error: "internal_error" })
    }
  })

  app.post("/external/jobs/:id/run-now", async (request, reply) => {
    try {
      const params = mutateJobParamsSchema.parse(request.params)
      const mutation = runTaskNowMutation(
        {
          jobsRepository: dependencies.jobsRepository,
          taskAuditRepository: dependencies.taskAuditRepository,
        },
        params.id,
        {
          lane: "scheduled",
          actor: "control_plane",
          source: "external_api",
        }
      )

      return reply.code(200).send(taskMutationResponseSchema.parse(mutation))
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.code(400).send({ error: "invalid_request", details: error.issues })
      }

      if (error instanceof TaskMutationError) {
        const failure = resolveTaskMutationErrorResponse(error)
        return reply.code(failure.statusCode).send(failure.body)
      }

      const err = error as Error
      dependencies.logger.error({ error: err.message }, "External API job run-now failed")
      return reply.code(500).send({ error: "internal_error" })
    }
  })

  app.get("/external/jobs/:id", async (request, reply) => {
    try {
      const params = getJobParamsSchema.parse(request.params)
      const job = getTaskById(dependencies.jobsRepository, params.id)

      if (!job) {
        return reply.code(404).send({ error: "not_found", message: "Task not found" })
      }

      return reply
        .code(200)
        .send(jobDetailsResponseSchema.parse({ job: mapTaskDetailsForExternal(job) }))
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.code(400).send({ error: "invalid_request", details: error.issues })
      }

      const err = error as Error
      dependencies.logger.error({ error: err.message }, "External API job detail failed")
      return reply.code(500).send({ error: "internal_error" })
    }
  })

  app.get("/external/jobs/:id/audit", async (request, reply) => {
    try {
      const params = getJobParamsSchema.parse(request.params)
      const query = listAuditQuerySchema.parse(request.query)
      const job = getTaskById(dependencies.jobsRepository, params.id)

      if (!job) {
        return reply.code(404).send({ error: "not_found", message: "Task not found" })
      }

      const entries = dependencies.taskAuditRepository
        .listByTaskId(params.id, query.limit)
        .map((entry) => ({
          id: entry.id,
          taskId: entry.taskId,
          action: entry.action,
          lane: entry.lane,
          actor: entry.actor,
          metadataJson: entry.metadataJson,
          createdAt: entry.createdAt,
        }))

      return reply.code(200).send(
        jobAuditResponseSchema.parse({
          taskId: params.id,
          entries,
        })
      )
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.code(400).send({ error: "invalid_request", details: error.issues })
      }

      const err = error as Error
      dependencies.logger.error({ error: err.message }, "External API job audit failed")
      return reply.code(500).send({ error: "internal_error" })
    }
  })

  app.get("/external/jobs/:id/runs", async (request, reply) => {
    try {
      const params = getJobParamsSchema.parse(request.params)
      const query = listRunsQuerySchema.parse(request.query)
      const job = getTaskById(dependencies.jobsRepository, params.id)

      if (!job) {
        return reply.code(404).send({ error: "not_found", message: "Task not found" })
      }

      const runs = dependencies.jobsRepository
        .listRunsByJobId(params.id, {
          limit: query.limit,
          offset: query.offset,
        })
        .map((run) => ({
          ...run,
          promptProvenance: parsePromptProvenanceJson(run.promptProvenanceJson ?? null),
        }))
      const total = dependencies.jobsRepository.countRunsByJobId(params.id)

      return reply.code(200).send(
        jobRunsResponseSchema.parse({
          taskId: params.id,
          total,
          limit: query.limit,
          offset: query.offset,
          runs,
        })
      )
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.code(400).send({ error: "invalid_request", details: error.issues })
      }

      const err = error as Error
      dependencies.logger.error({ error: err.message }, "External API job runs failed")
      return reply.code(500).send({ error: "internal_error" })
    }
  })

  app.get("/external/jobs/:id/runs/:runId", async (request, reply) => {
    try {
      const params = getRunParamsSchema.parse(request.params)
      const job = getTaskById(dependencies.jobsRepository, params.id)

      if (!job) {
        return reply.code(404).send({ error: "not_found", message: "Task not found" })
      }

      const run = dependencies.jobsRepository.getRunById(params.id, params.runId)
      if (!run) {
        return reply.code(404).send({ error: "not_found", message: "Run not found" })
      }

      const runWithProvenance = {
        ...run,
        promptProvenance: parsePromptProvenanceJson(run.promptProvenanceJson ?? null),
      }

      return reply.code(200).send(
        jobRunDetailResponseSchema.parse({
          taskId: params.id,
          run: runWithProvenance,
        })
      )
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.code(400).send({ error: "invalid_request", details: error.issues })
      }

      const err = error as Error
      dependencies.logger.error({ error: err.message }, "External API job run detail failed")
      return reply.code(500).send({ error: "internal_error" })
    }
  })

  return app
}

/**
 * Starts the external Fastify API as a LAN-accessible service so the separate control-plane
 * process can read Otto runtime state through authenticated HTTP contracts.
 *
 * @param dependencies External API configuration and persistence dependencies.
 * @returns Running server handle and shutdown function.
 */
export const startExternalApiServer = async (
  dependencies: ExternalApiServerDependencies
): Promise<{ url: string; close: () => Promise<void> }> => {
  const app = buildExternalApiServer(dependencies)
  await app.listen({ host: dependencies.config.host, port: dependencies.config.port })

  dependencies.logger.info(
    {
      host: dependencies.config.host,
      port: dependencies.config.port,
      tokenPath: dependencies.config.tokenPath,
    },
    "External API started"
  )

  return {
    url: dependencies.config.baseUrl,
    close: async () => {
      await app.close()
      dependencies.logger.info("External API stopped")
    },
  }
}
