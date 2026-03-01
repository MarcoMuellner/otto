import { randomUUID } from "node:crypto"

import {
  INTERACTIVE_BACKGROUND_ONESHOT_JOB_TYPE,
  interactiveBackgroundJobPayloadSchema,
  type InteractiveBackgroundJobPayload,
} from "./interactive-background-jobs.js"
import type {
  JobRecord,
  JobRunRecord,
  JobRunSessionRecord,
  JobTerminalState,
  TaskAuditRecord,
  TaskListRecord,
} from "../persistence/repositories.js"

type BackgroundJobsRepository = {
  listTasks: () => TaskListRecord[]
  getById: (jobId: string) => JobRecord | null
  cancelTask: (jobId: string, reason: string | null, updatedAt?: number) => void
  listRunsByJobId?: (
    jobId: string,
    options?: {
      limit?: number
      offset?: number
    }
  ) => JobRunRecord[]
}

type BackgroundJobRunSessionsRepository = {
  listActiveByJobId: (jobId: string) => JobRunSessionRecord[]
  markClosed: (runId: string, closedAt: number, closeErrorMessage: string | null) => void
}

type BackgroundTaskAuditRepository = {
  insert: (record: TaskAuditRecord) => void
}

type BackgroundSessionController = {
  closeSession: (sessionId: string) => Promise<void>
}

export type InteractiveBackgroundJobListItem = {
  jobId: string
  status: JobRecord["status"]
  terminalState: JobTerminalState | null
  terminalReason: string | null
  nextRunAt: number | null
  updatedAt: number
}

export type InteractiveBackgroundJobDetails = {
  job: JobRecord
  latestRun: JobRunRecord | null
  activeRunSessions: JobRunSessionRecord[]
  payload: InteractiveBackgroundJobPayload | null
  payloadParseError: string | null
}

type StopSessionResult = {
  sessionId: string
  runId: string
  status: "stopped" | "stop_failed"
  errorMessage: string | null
}

export type CancelInteractiveBackgroundJobResult = {
  jobId: string
  outcome: "cancelled" | "already_cancelled" | "already_terminal"
  terminalState: JobTerminalState
  stopSessionResults: StopSessionResult[]
}

const isInteractiveBackgroundTask = (
  task: Pick<TaskListRecord, "type" | "scheduleType">
): boolean => {
  return task.type === INTERACTIVE_BACKGROUND_ONESHOT_JOB_TYPE && task.scheduleType === "oneshot"
}

const parseInteractiveBackgroundPayload = (
  payload: string | null
): {
  parsed: InteractiveBackgroundJobPayload | null
  error: string | null
} => {
  if (!payload) {
    return {
      parsed: null,
      error: "Task payload is missing",
    }
  }

  try {
    const parsed = JSON.parse(payload)
    const validated = interactiveBackgroundJobPayloadSchema.safeParse(parsed)
    if (!validated.success) {
      return {
        parsed: null,
        error: validated.error.message,
      }
    }

    return {
      parsed: validated.data,
      error: null,
    }
  } catch {
    return {
      parsed: null,
      error: "Task payload is not valid JSON",
    }
  }
}

const isCompletedOrExpired = (terminalState: JobTerminalState | null): boolean => {
  return terminalState === "completed" || terminalState === "expired"
}

const insertTaskAudit = (
  dependencies: {
    taskAuditRepository: BackgroundTaskAuditRepository
  },
  input: {
    taskId: string
    actor: string
    beforeJson: string
    afterJson: string | null
    metadata: Record<string, unknown>
    createdAt: number
  }
): void => {
  dependencies.taskAuditRepository.insert({
    id: randomUUID(),
    taskId: input.taskId,
    action: "delete",
    lane: "interactive",
    actor: input.actor,
    beforeJson: input.beforeJson,
    afterJson: input.afterJson,
    metadataJson: JSON.stringify(input.metadata),
    createdAt: input.createdAt,
  })
}

/**
 * Lists only interactive background one-shot tasks so chat surfaces can expose the MVP
 * background controls without mixing in system or scheduled automation jobs.
 */
export const listInteractiveBackgroundJobs = (dependencies: {
  jobsRepository: Pick<BackgroundJobsRepository, "listTasks">
}): InteractiveBackgroundJobListItem[] => {
  return dependencies.jobsRepository
    .listTasks()
    .filter((task) => isInteractiveBackgroundTask(task))
    .map((task) => ({
      jobId: task.id,
      status: task.status,
      terminalState: task.terminalState,
      terminalReason: task.terminalReason,
      nextRunAt: task.nextRunAt,
      updatedAt: task.updatedAt,
    }))
}

/**
 * Resolves one interactive background task by canonical `job_id` and includes run/session
 * context so operators can inspect current execution state from any chat surface.
 */
export const getInteractiveBackgroundJobById = (
  dependencies: {
    jobsRepository: Pick<BackgroundJobsRepository, "getById" | "listRunsByJobId">
    jobRunSessionsRepository: Pick<BackgroundJobRunSessionsRepository, "listActiveByJobId">
  },
  jobId: string
): InteractiveBackgroundJobDetails | null => {
  const job = dependencies.jobsRepository.getById(jobId)
  if (!job || !isInteractiveBackgroundTask(job)) {
    return null
  }

  const latestRun = dependencies.jobsRepository.listRunsByJobId
    ? (dependencies.jobsRepository.listRunsByJobId(jobId, { limit: 1, offset: 0 })[0] ?? null)
    : null

  const activeRunSessions = dependencies.jobRunSessionsRepository.listActiveByJobId(jobId)
  const payload = parseInteractiveBackgroundPayload(job.payload)

  return {
    job,
    latestRun,
    activeRunSessions,
    payload: payload.parsed,
    payloadParseError: payload.error,
  }
}

/**
 * Cancels interactive background one-shot tasks with idempotent terminal behavior:
 * completed/expired runs are preserved, cancelled runs remain cancelled, and active sessions
 * are stopped best-effort before deterministic task cancellation.
 */
export const cancelInteractiveBackgroundJob = async (
  dependencies: {
    jobsRepository: Pick<BackgroundJobsRepository, "getById" | "cancelTask">
    jobRunSessionsRepository: Pick<
      BackgroundJobRunSessionsRepository,
      "listActiveByJobId" | "markClosed"
    >
    taskAuditRepository: BackgroundTaskAuditRepository
    sessionController?: BackgroundSessionController
    now?: () => number
  },
  input: {
    jobId: string
    reason?: string
    actor: string
    source: "internal_api" | "external_api"
  }
): Promise<CancelInteractiveBackgroundJobResult | null> => {
  const existing = dependencies.jobsRepository.getById(input.jobId)
  if (!existing || !isInteractiveBackgroundTask(existing)) {
    return null
  }

  const now = (dependencies.now ?? Date.now)()
  const stopSessionResults: StopSessionResult[] = []

  const activeSessions = dependencies.jobRunSessionsRepository.listActiveByJobId(input.jobId)
  for (const session of activeSessions) {
    let errorMessage: string | null = null

    try {
      if (!dependencies.sessionController?.closeSession) {
        throw new Error("Session close is unavailable")
      }

      await dependencies.sessionController.closeSession(session.sessionId)
    } catch (error) {
      const err = error as Error
      errorMessage = err.message
    }

    dependencies.jobRunSessionsRepository.markClosed(session.runId, now, errorMessage)
    stopSessionResults.push({
      sessionId: session.sessionId,
      runId: session.runId,
      status: errorMessage ? "stop_failed" : "stopped",
      errorMessage,
    })
  }

  const latest = dependencies.jobsRepository.getById(input.jobId) ?? existing

  if (isCompletedOrExpired(latest.terminalState)) {
    const terminalState = latest.terminalState === "completed" ? "completed" : "expired"

    insertTaskAudit(
      {
        taskAuditRepository: dependencies.taskAuditRepository,
      },
      {
        taskId: input.jobId,
        actor: input.actor,
        beforeJson: JSON.stringify(existing),
        afterJson: JSON.stringify(latest),
        metadata: {
          command: "cancel_background_task",
          source: input.source,
          outcome: "already_terminal",
          reason: input.reason ?? null,
          stopSessionResults,
        },
        createdAt: now,
      }
    )

    return {
      jobId: input.jobId,
      outcome: "already_terminal",
      terminalState,
      stopSessionResults,
    }
  }

  if (latest.terminalState === "cancelled") {
    insertTaskAudit(
      {
        taskAuditRepository: dependencies.taskAuditRepository,
      },
      {
        taskId: input.jobId,
        actor: input.actor,
        beforeJson: JSON.stringify(existing),
        afterJson: JSON.stringify(latest),
        metadata: {
          command: "cancel_background_task",
          source: input.source,
          outcome: "already_cancelled",
          reason: input.reason ?? null,
          stopSessionResults,
        },
        createdAt: now,
      }
    )

    return {
      jobId: input.jobId,
      outcome: "already_cancelled",
      terminalState: "cancelled",
      stopSessionResults,
    }
  }

  dependencies.jobsRepository.cancelTask(input.jobId, input.reason ?? null, now)
  const updated = dependencies.jobsRepository.getById(input.jobId)

  insertTaskAudit(
    {
      taskAuditRepository: dependencies.taskAuditRepository,
    },
    {
      taskId: input.jobId,
      actor: input.actor,
      beforeJson: JSON.stringify(existing),
      afterJson: updated ? JSON.stringify(updated) : null,
      metadata: {
        command: "cancel_background_task",
        source: input.source,
        outcome: "cancelled",
        reason: input.reason ?? null,
        stopSessionResults,
      },
      createdAt: now,
    }
  )

  return {
    jobId: input.jobId,
    outcome: "cancelled",
    terminalState: "cancelled",
    stopSessionResults,
  }
}
