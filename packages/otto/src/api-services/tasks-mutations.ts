import { randomUUID } from "node:crypto"

import { z } from "zod"

import { resolveTaskManagedBy } from "./tasks-read.js"
import { modelRefSchema } from "../model-management/contracts.js"
import type { JobRecord, JobScheduleType, TaskAuditRecord } from "../persistence/repositories.js"

export type TaskMutationResultStatus = "created" | "updated" | "deleted" | "run_now_scheduled"

export type TaskMutationResult = {
  id: string
  status: TaskMutationResultStatus
  scheduledFor?: number
}

export type TaskMutationErrorCode =
  | "invalid_request"
  | "not_found"
  | "forbidden_mutation"
  | "state_conflict"

export class TaskMutationError extends Error {
  code: TaskMutationErrorCode

  constructor(code: TaskMutationErrorCode, message: string) {
    super(message)
    this.name = "TaskMutationError"
    this.code = code
  }
}

export const taskCreateInputSchema = z
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

export const taskUpdateInputSchema = z
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

export const taskDeleteInputSchema = z.object({
  reason: z.string().trim().min(1).optional(),
})

export type TaskCreateInput = z.infer<typeof taskCreateInputSchema>
export type TaskUpdateInput = z.infer<typeof taskUpdateInputSchema>
export type TaskDeleteInput = z.infer<typeof taskDeleteInputSchema>

type TaskMutationsRepository = {
  getById: (jobId: string) => JobRecord | null
  createTask: (record: JobRecord) => void
  updateTask: (
    jobId: string,
    update: {
      type: string
      scheduleType: JobScheduleType
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

type TaskMutationsAuditRepository = {
  insert: (record: TaskAuditRecord) => void
}

type TaskMutationDependencies = {
  jobsRepository: TaskMutationsRepository
  taskAuditRepository: TaskMutationsAuditRepository
  now?: () => number
}

type TaskMutationContext = {
  lane: "interactive" | "scheduled"
  actor: string
  source: "internal_api" | "external_api"
}

const resolveNow = (dependencies: TaskMutationDependencies): number => {
  return (dependencies.now ?? Date.now)()
}

const ensureTaskExists = (jobsRepository: TaskMutationsRepository, taskId: string): JobRecord => {
  const existing = jobsRepository.getById(taskId)
  if (!existing) {
    throw new TaskMutationError("not_found", "Task not found")
  }

  return existing
}

const assertTaskMutable = (task: JobRecord): void => {
  if (resolveTaskManagedBy(task) === "system") {
    throw new TaskMutationError(
      "forbidden_mutation",
      "System-managed jobs are read-only and cannot be mutated"
    )
  }
}

const assertTaskNotRunning = (task: JobRecord, action: "update" | "delete" | "run_now"): void => {
  if (task.status !== "running") {
    return
  }

  throw new TaskMutationError("state_conflict", `Cannot ${action} while job is currently running`)
}

const insertTaskAudit = (
  dependencies: TaskMutationDependencies,
  input: {
    taskId: string
    action: "create" | "update" | "delete"
    lane: "interactive" | "scheduled"
    actor: string
    beforeJson: string | null
    afterJson: string | null
    metadata: Record<string, unknown>
    createdAt: number
  }
): void => {
  dependencies.taskAuditRepository.insert({
    id: randomUUID(),
    taskId: input.taskId,
    action: input.action,
    lane: input.lane,
    actor: input.actor,
    beforeJson: input.beforeJson,
    afterJson: input.afterJson,
    metadataJson: JSON.stringify(input.metadata),
    createdAt: input.createdAt,
  })
}

/**
 * Creates a scheduled task while ensuring audit metadata and ownership defaults remain
 * consistent across internal and external API adapters.
 */
export const createTaskMutation = (
  dependencies: TaskMutationDependencies,
  input: TaskCreateInput,
  context: TaskMutationContext
): TaskMutationResult => {
  const now = resolveNow(dependencies)
  const taskId = input.id ?? randomUUID()

  if (dependencies.jobsRepository.getById(taskId)) {
    throw new TaskMutationError("state_conflict", `Task already exists: ${taskId}`)
  }

  const runAt = input.runAt ?? now

  dependencies.jobsRepository.createTask({
    id: taskId,
    type: input.type,
    status: "idle",
    scheduleType: input.scheduleType,
    profileId: input.profileId ?? null,
    modelRef: input.modelRef ?? null,
    runAt,
    cadenceMinutes: input.scheduleType === "recurring" ? (input.cadenceMinutes ?? null) : null,
    payload: input.payload ? JSON.stringify(input.payload) : null,
    lastRunAt: null,
    nextRunAt: runAt,
    terminalState: null,
    terminalReason: null,
    lockToken: null,
    lockExpiresAt: null,
    createdAt: now,
    updatedAt: now,
  })

  const after = dependencies.jobsRepository.getById(taskId)

  insertTaskAudit(dependencies, {
    taskId,
    action: "create",
    lane: context.lane,
    actor: context.actor,
    beforeJson: null,
    afterJson: after ? JSON.stringify(after) : null,
    metadata: {
      command: "create_task",
      source: context.source,
      scheduleType: input.scheduleType,
    },
    createdAt: now,
  })

  return {
    id: taskId,
    status: "created",
  }
}

/**
 * Updates a mutable operator-managed task and appends lifecycle audit context so mutation
 * outcomes remain traceable from both CLI-adjacent and control-plane flows.
 */
export const updateTaskMutation = (
  dependencies: TaskMutationDependencies,
  taskId: string,
  input: TaskUpdateInput,
  context: TaskMutationContext
): TaskMutationResult => {
  const existing = ensureTaskExists(dependencies.jobsRepository, taskId)
  assertTaskMutable(existing)
  assertTaskNotRunning(existing, "update")

  const scheduleType = input.scheduleType ?? existing.scheduleType
  const runAt = input.runAt === undefined ? existing.runAt : input.runAt
  const cadenceMinutes =
    input.cadenceMinutes === undefined ? existing.cadenceMinutes : input.cadenceMinutes
  const normalizedRunAt = scheduleType === "recurring" && runAt === null ? existing.runAt : runAt
  const nextRunAtFromInput =
    input.runAt === undefined
      ? existing.nextRunAt
      : scheduleType === "recurring" && runAt === null
        ? existing.nextRunAt
        : normalizedRunAt

  if (scheduleType === "oneshot" && runAt === null) {
    throw new TaskMutationError("invalid_request", "runAt cannot be null for oneshot tasks")
  }

  if (scheduleType === "recurring" && cadenceMinutes === null) {
    throw new TaskMutationError(
      "invalid_request",
      "cadenceMinutes cannot be null for recurring tasks"
    )
  }

  const now = resolveNow(dependencies)
  dependencies.jobsRepository.updateTask(
    taskId,
    {
      type: input.type ?? existing.type,
      scheduleType,
      profileId: input.profileId === undefined ? existing.profileId : input.profileId,
      modelRef: input.modelRef === undefined ? existing.modelRef : input.modelRef,
      runAt: normalizedRunAt,
      cadenceMinutes,
      payload:
        input.payload === undefined
          ? existing.payload
          : input.payload === null
            ? null
            : JSON.stringify(input.payload),
      nextRunAt: nextRunAtFromInput,
    },
    now
  )

  const updated = dependencies.jobsRepository.getById(taskId)

  insertTaskAudit(dependencies, {
    taskId,
    action: "update",
    lane: context.lane,
    actor: context.actor,
    beforeJson: JSON.stringify(existing),
    afterJson: updated ? JSON.stringify(updated) : null,
    metadata: {
      command: "update_task",
      source: context.source,
    },
    createdAt: now,
  })

  return {
    id: taskId,
    status: "updated",
  }
}

/**
 * Cancels a mutable operator-managed task and records cancellation context for operator-facing
 * audit timelines.
 */
export const deleteTaskMutation = (
  dependencies: TaskMutationDependencies,
  taskId: string,
  input: TaskDeleteInput,
  context: TaskMutationContext
): TaskMutationResult => {
  const existing = ensureTaskExists(dependencies.jobsRepository, taskId)
  assertTaskMutable(existing)
  assertTaskNotRunning(existing, "delete")

  const now = resolveNow(dependencies)
  dependencies.jobsRepository.cancelTask(taskId, input.reason ?? null, now)
  const updated = dependencies.jobsRepository.getById(taskId)

  insertTaskAudit(dependencies, {
    taskId,
    action: "delete",
    lane: context.lane,
    actor: context.actor,
    beforeJson: JSON.stringify(existing),
    afterJson: updated ? JSON.stringify(updated) : null,
    metadata: {
      command: "delete_task",
      source: context.source,
      reason: input.reason ?? null,
    },
    createdAt: now,
  })

  return {
    id: taskId,
    status: "deleted",
  }
}

/**
 * Marks an operator-managed task as immediately eligible for scheduler pickup while keeping
 * state transitions and audit evidence explicit.
 */
export const runTaskNowMutation = (
  dependencies: TaskMutationDependencies,
  taskId: string,
  context: TaskMutationContext
): TaskMutationResult => {
  const existing = ensureTaskExists(dependencies.jobsRepository, taskId)
  assertTaskMutable(existing)
  assertTaskNotRunning(existing, "run_now")

  if (existing.status === "paused") {
    throw new TaskMutationError("state_conflict", "Task is paused and cannot run now")
  }

  const now = resolveNow(dependencies)
  dependencies.jobsRepository.runTaskNow(taskId, now, now)
  const updated = dependencies.jobsRepository.getById(taskId)

  insertTaskAudit(dependencies, {
    taskId,
    action: "update",
    lane: context.lane,
    actor: context.actor,
    beforeJson: JSON.stringify(existing),
    afterJson: updated ? JSON.stringify(updated) : null,
    metadata: {
      command: "run_now",
      source: context.source,
      scheduledFor: now,
    },
    createdAt: now,
  })

  return {
    id: taskId,
    status: "run_now_scheduled",
    scheduledFor: now,
  }
}
