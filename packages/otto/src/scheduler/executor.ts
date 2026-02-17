import { randomUUID } from "node:crypto"

import type { Logger } from "pino"
import { z } from "zod"

import type { JobRecord, JobRunStatus, JobTerminalState } from "../persistence/repositories.js"
import type { OpencodeSessionGateway } from "../telegram-worker/opencode.js"
import { resolveScheduleTransition } from "./schedule.js"
import {
  buildEffectiveTaskExecutionConfig,
  loadTaskProfile,
  loadTaskRuntimeBaseConfig,
} from "./task-config.js"
import { checkTaskFailures, WATCHDOG_TASK_TYPE, watchdogPayloadSchema } from "./watchdog.js"

const taskExecutionResultSchema = z.object({
  status: z.enum(["success", "failed", "skipped"]),
  summary: z.string().trim().min(1),
  errors: z
    .array(
      z.object({
        code: z.string().trim().min(1),
        message: z.string().trim().min(1),
      })
    )
    .optional()
    .default([]),
})

type TaskExecutionResult = z.infer<typeof taskExecutionResultSchema>
type TaskExecutionParseOutcome = {
  result: TaskExecutionResult
  rawOutput: string | null
  parseErrorCode: string | null
  parseErrorMessage: string | null
}

type SchedulerLogger = Pick<Logger, "info" | "warn" | "error">

type ClaimedJobRecord = Pick<
  JobRecord,
  | "id"
  | "type"
  | "scheduleType"
  | "cadenceMinutes"
  | "nextRunAt"
  | "profileId"
  | "payload"
  | "lockToken"
>

type TaskExecutionEngineDependencies = {
  logger: SchedulerLogger
  ottoHome: string
  jobsRepository: {
    insertRun: (record: {
      id: string
      jobId: string
      scheduledFor: number | null
      startedAt: number
      finishedAt: number | null
      status: JobRunStatus
      errorCode: string | null
      errorMessage: string | null
      resultJson: string | null
      createdAt: number
    }) => void
    markRunFinished: (
      runId: string,
      status: JobRunStatus,
      finishedAt: number,
      errorCode: string | null,
      errorMessage: string | null,
      resultJson: string | null
    ) => void
    rescheduleRecurring: (
      jobId: string,
      lockToken: string,
      lastRunAt: number,
      nextRunAt: number,
      updatedAt?: number
    ) => void
    finalizeOneShot: (
      jobId: string,
      lockToken: string,
      terminalState: JobTerminalState,
      terminalReason: string | null,
      lastRunAt: number,
      updatedAt?: number
    ) => void
    releaseLock: (jobId: string, lockToken: string, updatedAt?: number) => void
    listRecentFailedRuns: (
      sinceTimestamp: number,
      limit?: number
    ) => Array<{
      runId: string
      jobId: string
      jobType: string
      startedAt: number
      errorCode: string | null
      errorMessage: string | null
    }>
  }
  sessionBindingsRepository: {
    getByBindingKey: (bindingKey: string) => { sessionId: string } | null
    upsert: (bindingKey: string, sessionId: string, updatedAt?: number) => void
  }
  outboundMessagesRepository: {
    enqueueOrIgnoreDedupe: (record: {
      id: string
      dedupeKey: string | null
      chatId: number
      content: string
      priority: "low" | "normal" | "high"
      status: "queued"
      attemptCount: number
      nextAttemptAt: number
      sentAt: null
      failedAt: null
      errorMessage: null
      createdAt: number
      updatedAt: number
    }) => "enqueued" | "duplicate"
  }
  sessionGateway: OpencodeSessionGateway
  defaultWatchdogChatId: number | null
  now?: () => number
}

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

const resolveTools = (value: unknown): Record<string, boolean> | undefined => {
  const record = asRecord(value)
  if (!record) {
    return undefined
  }

  const toolEntries = Object.entries(record).filter((entry): entry is [string, boolean] => {
    return typeof entry[1] === "boolean"
  })
  if (toolEntries.length === 0) {
    return undefined
  }

  return Object.fromEntries(toolEntries)
}

const parseTaskPayload = (payload: string | null): { parsed: unknown; error: string | null } => {
  if (!payload) {
    return {
      parsed: null,
      error: null,
    }
  }

  try {
    return {
      parsed: JSON.parse(payload),
      error: null,
    }
  } catch {
    return {
      parsed: null,
      error: "Task payload is not valid JSON",
    }
  }
}

const toFailureResult = (code: string, message: string): TaskExecutionResult => {
  return {
    status: "failed",
    summary: message,
    errors: [
      {
        code,
        message,
      },
    ],
  }
}

const normalizeExecutionResult = (value: unknown): unknown => {
  const record = asRecord(value)
  if (!record) {
    return value
  }

  const status = typeof record.status === "string" ? record.status : null
  const summary = typeof record.summary === "string" ? record.summary.trim() : null
  if (!status || !summary) {
    return value
  }

  const normalizedErrors: Array<{ code: string; message: string }> = []
  if (Array.isArray(record.errors)) {
    for (const entry of record.errors) {
      if (typeof entry === "string" && entry.trim().length > 0) {
        normalizedErrors.push({
          code: "task_error",
          message: entry.trim(),
        })
        continue
      }

      const objectEntry = asRecord(entry)
      if (objectEntry) {
        const code = typeof objectEntry.code === "string" ? objectEntry.code.trim() : ""
        const message = typeof objectEntry.message === "string" ? objectEntry.message.trim() : ""
        if (code.length > 0 && message.length > 0) {
          normalizedErrors.push({ code, message })
          continue
        }
      }

      if (entry != null) {
        normalizedErrors.push({
          code: "task_error",
          message: String(entry),
        })
      }
    }
  }

  return {
    status,
    summary,
    errors: normalizedErrors,
  }
}

const parseStructuredResult = (assistantText: string): TaskExecutionParseOutcome => {
  const trimmed = assistantText.trim()
  if (trimmed.length === 0) {
    return {
      result: toFailureResult("invalid_result_json", "Task execution returned empty output"),
      rawOutput: null,
      parseErrorCode: "invalid_result_json",
      parseErrorMessage: "Task execution returned empty output",
    }
  }

  const validateParsedResult = (parsed: unknown): TaskExecutionParseOutcome => {
    const normalized = normalizeExecutionResult(parsed)
    const validated = taskExecutionResultSchema.safeParse(normalized)

    if (!validated.success) {
      return {
        result: toFailureResult("invalid_result_schema", validated.error.message),
        rawOutput: trimmed,
        parseErrorCode: "invalid_result_schema",
        parseErrorMessage: validated.error.message,
      }
    }

    return {
      result: validated.data,
      rawOutput: null,
      parseErrorCode: null,
      parseErrorMessage: null,
    }
  }

  try {
    return validateParsedResult(JSON.parse(trimmed))
  } catch {
    const fencedMatch = trimmed.match(/```json\s*([\s\S]*?)\s*```/i)

    if (!fencedMatch?.[1]) {
      return {
        result: toFailureResult("invalid_result_json", "Task execution output must be valid JSON"),
        rawOutput: trimmed,
        parseErrorCode: "invalid_result_json",
        parseErrorMessage: "Task execution output must be valid JSON",
      }
    }

    try {
      return validateParsedResult(JSON.parse(fencedMatch[1]))
    } catch {
      return {
        result: toFailureResult("invalid_result_json", "Task execution output must be valid JSON"),
        rawOutput: trimmed,
        parseErrorCode: "invalid_result_json",
        parseErrorMessage: "Task execution output must be valid JSON",
      }
    }
  }
}

const serializePersistedResult = (
  result: TaskExecutionResult,
  rawOutput: string | null
): string => {
  if (!rawOutput) {
    return JSON.stringify(result)
  }

  return JSON.stringify({
    ...result,
    rawOutput,
  })
}

const mapRunStatus = (
  result: TaskExecutionResult
): { status: JobRunStatus; errorCode: string | null; errorMessage: string | null } => {
  if (result.status === "success") {
    return {
      status: "success",
      errorCode: null,
      errorMessage: null,
    }
  }

  if (result.status === "skipped") {
    return {
      status: "skipped",
      errorCode: null,
      errorMessage: null,
    }
  }

  return {
    status: "failed",
    errorCode: result.errors[0]?.code ?? "task_failed",
    errorMessage: result.errors[0]?.message ?? result.summary,
  }
}

const buildExecutionPrompt = (
  job: ClaimedJobRecord,
  payload: unknown,
  nowTimestamp: number
): string => {
  return [
    "Execute this scheduled Otto task now.",
    "Return only a JSON object with keys: status, summary, errors.",
    "status must be one of: success, failed, skipped.",
    "Do not ask clarifying questions and do not include markdown.",
    "",
    "Task:",
    JSON.stringify(
      {
        id: job.id,
        type: job.type,
        scheduleType: job.scheduleType,
        profileId: job.profileId,
        payload,
        executedAt: nowTimestamp,
      },
      null,
      2
    ),
  ].join("\n")
}

const executeWatchdogTask = (
  dependencies: TaskExecutionEngineDependencies,
  job: ClaimedJobRecord,
  nowTimestamp: number
): TaskExecutionResult => {
  const payloadParsed = parseTaskPayload(job.payload)
  if (payloadParsed.error) {
    return toFailureResult("invalid_watchdog_payload", payloadParsed.error)
  }

  const validatedPayload = watchdogPayloadSchema.safeParse(payloadParsed.parsed ?? {})
  if (!validatedPayload.success) {
    return toFailureResult("invalid_watchdog_payload", validatedPayload.error.message)
  }

  const checkResult = checkTaskFailures(
    {
      jobsRepository: dependencies.jobsRepository,
      outboundMessagesRepository: dependencies.outboundMessagesRepository,
      defaultChatId: dependencies.defaultWatchdogChatId,
    },
    {
      ...validatedPayload.data,
      excludeTaskTypes: [WATCHDOG_TASK_TYPE],
    },
    () => nowTimestamp
  )

  if (checkResult.shouldAlert && checkResult.notificationStatus === "no_chat_id") {
    return toFailureResult(
      "watchdog_notification_unavailable",
      "Watchdog detected failures but no Telegram chat id is configured for alerts"
    )
  }

  const notificationSummary =
    checkResult.notificationStatus === "not_requested"
      ? "notification skipped"
      : `notification ${checkResult.notificationStatus}`

  return {
    status: "success",
    summary: `Watchdog checked ${checkResult.failedCount} failed runs (${notificationSummary})`,
    errors: [],
  }
}

/**
 * Creates the scheduler execution engine that converts claimed jobs into durable run history
 * with deterministic post-run scheduling transitions.
 *
 * @param dependencies Runtime dependencies for model execution, persistence, and watchdog checks.
 * @returns Claimed-job executor used by scheduler kernel ticks.
 */
export const createTaskExecutionEngine = (dependencies: TaskExecutionEngineDependencies) => {
  const now = dependencies.now ?? Date.now

  return {
    executeClaimedJob: async (job: ClaimedJobRecord): Promise<void> => {
      const lockToken = job.lockToken
      if (!lockToken) {
        throw new Error(`Claimed job ${job.id} is missing lock token`)
      }

      const startedAt = now()
      const runId = randomUUID()
      dependencies.jobsRepository.insertRun({
        id: runId,
        jobId: job.id,
        scheduledFor: job.nextRunAt,
        startedAt,
        finishedAt: null,
        status: "skipped",
        errorCode: null,
        errorMessage: null,
        resultJson: null,
        createdAt: startedAt,
      })

      let result: TaskExecutionResult
      let persistedRawOutput: string | null = null

      try {
        if (job.type === WATCHDOG_TASK_TYPE) {
          result = executeWatchdogTask(dependencies, job, startedAt)
        } else {
          const payloadParsed = parseTaskPayload(job.payload)
          if (payloadParsed.error) {
            result = toFailureResult("invalid_task_payload", payloadParsed.error)
          } else {
            const baseConfig = await loadTaskRuntimeBaseConfig(dependencies.ottoHome)
            const profile = job.profileId
              ? await loadTaskProfile(dependencies.ottoHome, job.profileId)
              : undefined
            const effectiveConfig = buildEffectiveTaskExecutionConfig(
              baseConfig,
              "scheduled",
              profile
            )
            const assistant = asRecord(asRecord(effectiveConfig.opencodeConfig.agent)?.assistant)
            const systemPrompt =
              typeof assistant?.prompt === "string" ? assistant.prompt : undefined
            const tools = resolveTools(assistant?.tools)

            const bindingKey = `scheduler:task:${job.id}:assistant`
            const existingBinding =
              dependencies.sessionBindingsRepository.getByBindingKey(bindingKey)
            const sessionId = await dependencies.sessionGateway.ensureSession(
              existingBinding?.sessionId ?? null
            )
            if (existingBinding?.sessionId !== sessionId) {
              dependencies.sessionBindingsRepository.upsert(bindingKey, sessionId, now())
            }

            const assistantOutput = await dependencies.sessionGateway.promptSession(
              sessionId,
              buildExecutionPrompt(job, payloadParsed.parsed, startedAt),
              {
                systemPrompt,
                tools,
                agent: "assistant",
              }
            )

            const parsedResult = parseStructuredResult(assistantOutput)
            if (parsedResult.parseErrorCode) {
              dependencies.logger.warn(
                {
                  jobId: job.id,
                  parseErrorCode: parsedResult.parseErrorCode,
                  parseErrorMessage: parsedResult.parseErrorMessage,
                  rawOutput: parsedResult.rawOutput,
                },
                "Task execution returned non-conforming structured output"
              )
            }

            result = parsedResult.result
            persistedRawOutput = parsedResult.rawOutput
          }
        }
      } catch (error) {
        const err = error as Error
        dependencies.logger.error({ jobId: job.id, error: err.message }, "Task execution failed")
        result = toFailureResult("task_execution_error", err.message)
      }

      const finishedAt = now()
      const runStatus = mapRunStatus(result)
      dependencies.jobsRepository.markRunFinished(
        runId,
        runStatus.status,
        finishedAt,
        runStatus.errorCode,
        runStatus.errorMessage,
        serializePersistedResult(result, persistedRawOutput)
      )

      try {
        const transition = resolveScheduleTransition(
          {
            id: job.id,
            scheduleType: job.scheduleType,
            cadenceMinutes: job.cadenceMinutes,
          },
          finishedAt
        )

        if (transition.mode === "reschedule") {
          dependencies.jobsRepository.rescheduleRecurring(
            job.id,
            lockToken,
            transition.lastRunAt,
            transition.nextRunAt,
            finishedAt
          )
          return
        }

        dependencies.jobsRepository.finalizeOneShot(
          job.id,
          lockToken,
          transition.terminalState,
          transition.terminalReason,
          transition.lastRunAt,
          finishedAt
        )
      } catch (error) {
        const err = error as Error
        dependencies.logger.error(
          { jobId: job.id, error: err.message },
          "Task post-run scheduling transition failed"
        )
        dependencies.jobsRepository.releaseLock(job.id, lockToken, finishedAt)
      }
    },
  }
}
