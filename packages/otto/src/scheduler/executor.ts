import { randomUUID } from "node:crypto"

import type { Logger } from "pino"
import { z } from "zod"

import {
  INTERACTIVE_BACKGROUND_ONESHOT_JOB_TYPE,
  interactiveBackgroundJobPayloadSchema,
} from "../api-services/interactive-background-jobs.js"
import type { JobRecord, JobRunStatus, JobTerminalState } from "../persistence/repositories.js"
import {
  PROMPT_ROUTE_MEDIA_VALUES,
  resolveJobSystemPrompt,
  type PromptRouteMedia,
} from "../prompt-management/index.js"
import type { OpencodeSessionGateway } from "../telegram-worker/opencode.js"
import { enqueueTelegramMessage } from "../telegram-worker/outbound-enqueue.js"
import { executeHeartbeatTask, HEARTBEAT_TASK_TYPE } from "./heartbeat.js"
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
  | "modelRef"
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
    listRecentRuns: (
      sinceTimestamp: number,
      limit?: number
    ) => Array<{
      runId: string
      jobId: string
      jobType: string
      startedAt: number
      finishedAt: number | null
      status: JobRunStatus
      errorCode: string | null
      errorMessage: string | null
      resultJson: string | null
    }>
  }
  jobRunSessionsRepository: {
    insert: (record: { runId: string; jobId: string; sessionId: string; createdAt: number }) => void
    markClosed: (runId: string, closedAt: number, closeErrorMessage: string | null) => void
  }
  sessionBindingsRepository: {
    getByBindingKey: (bindingKey: string) => { sessionId: string } | null
    getTelegramChatIdBySessionId: (sessionId: string) => number | null
    upsert: (bindingKey: string, sessionId: string, updatedAt?: number) => void
  }
  outboundMessagesRepository: {
    enqueueOrIgnoreDedupe: (record: {
      id: string
      dedupeKey: string | null
      chatId: number
      kind: "text" | "document" | "photo"
      content: string
      mediaPath: string | null
      mediaMimeType: string | null
      mediaFilename: string | null
      priority: "low" | "normal" | "high" | "critical"
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
  userProfileRepository: {
    get: () => {
      timezone: string | null
      quietHoursStart: string | null
      quietHoursEnd: string | null
      quietMode: "critical_only" | "off" | null
      muteUntil: number | null
      heartbeatMorning: string | null
      heartbeatMidday: string | null
      heartbeatEvening: string | null
      heartbeatCadenceMinutes: number | null
      heartbeatOnlyIfSignal: boolean
      onboardingCompletedAt: number | null
      lastDigestAt: number | null
      updatedAt: number
    } | null
    setLastDigestAt: (lastDigestAt: number, updatedAt?: number) => void
  }
  now?: () => number
}

type BackgroundLifecycleContext = {
  jobId: string
  runId: string
  sourceSessionId: string | null
  sourceChatId: number | null
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

const isPromptRouteMedia = (value: unknown): value is PromptRouteMedia => {
  return (
    typeof value === "string" &&
    PROMPT_ROUTE_MEDIA_VALUES.includes(value as (typeof PROMPT_ROUTE_MEDIA_VALUES)[number])
  )
}

const resolvePromptRouteMediaFromPayload = (payload: unknown): PromptRouteMedia | undefined => {
  const payloadRecord = asRecord(payload)
  if (!payloadRecord) {
    return undefined
  }

  const directMedia = payloadRecord.media
  if (isPromptRouteMedia(directMedia)) {
    return directMedia
  }

  const source = asRecord(payloadRecord.source)
  if (!source) {
    return undefined
  }

  const sourceMedia = source.media
  if (isPromptRouteMedia(sourceMedia)) {
    return sourceMedia
  }

  if (Number.isInteger(source.chatId) && Number(source.chatId) > 0) {
    return "chatapps"
  }

  return undefined
}

const resolveJobExecutionSystemPrompt = async (input: {
  dependencies: TaskExecutionEngineDependencies
  jobId: string
  flow: "scheduled" | "background" | "watchdog"
  payload: unknown
  profileId: string | null
  fallbackSystemPrompt?: string
}): Promise<string | undefined> => {
  try {
    const resolved = await resolveJobSystemPrompt({
      ottoHome: input.dependencies.ottoHome,
      flow: input.flow,
      media: input.flow === "watchdog" ? null : resolvePromptRouteMediaFromPayload(input.payload),
      profileId: input.profileId,
      logger: input.dependencies.logger,
    })

    if (resolved.systemPrompt.trim().length > 0) {
      return resolved.systemPrompt
    }
  } catch (error) {
    const err = error as Error
    input.dependencies.logger.error(
      {
        jobId: input.jobId,
        flow: input.flow,
        profileId: input.profileId,
        error: err.message,
      },
      "Failed to resolve prompt layers for job execution; falling back to task config prompt"
    )
  }

  if (
    typeof input.fallbackSystemPrompt === "string" &&
    input.fallbackSystemPrompt.trim().length > 0
  ) {
    return input.fallbackSystemPrompt
  }

  return undefined
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

const buildInteractiveBackgroundPrompt = (
  payload: z.infer<typeof interactiveBackgroundJobPayloadSchema>
) => {
  return [
    "Execute this interactive background request now.",
    "Work autonomously and do not ask clarifying questions.",
    "When useful, call report_background_milestone with concise free-text phase updates.",
    "Do not spam milestone updates; call it only on meaningful phase changes.",
    "Return only a JSON object with keys: status, summary, errors.",
    "status must be one of: success, failed, skipped.",
    "Do not include markdown.",
    "",
    payload.request.text,
  ].join("\n")
}

const resolveBackgroundLifecycleChatId = (
  dependencies: TaskExecutionEngineDependencies,
  context: BackgroundLifecycleContext
): number | null => {
  if (context.sourceChatId) {
    return context.sourceChatId
  }

  if (context.sourceSessionId) {
    const boundChatId = dependencies.sessionBindingsRepository.getTelegramChatIdBySessionId(
      context.sourceSessionId
    )
    if (boundChatId) {
      return boundChatId
    }
  }

  return dependencies.defaultWatchdogChatId
}

const enqueueBackgroundLifecycleMessage = (
  dependencies: TaskExecutionEngineDependencies,
  context: BackgroundLifecycleContext,
  input: {
    phase: "started" | "final_success" | "final_failed" | "final_skipped"
    content: string
    priority?: "low" | "normal" | "high" | "critical"
    timestamp: number
  }
): void => {
  try {
    const chatId = resolveBackgroundLifecycleChatId(dependencies, context)
    if (!chatId) {
      dependencies.logger.warn(
        {
          jobId: context.jobId,
          runId: context.runId,
          phase: input.phase,
        },
        "Skipped background lifecycle Telegram message because chat id could not be resolved"
      )
      return
    }

    const dedupeKey = `bg-run:${context.jobId}:${context.runId}:${input.phase}`
    const enqueueResult = enqueueTelegramMessage(
      {
        chatId,
        content: input.content,
        dedupeKey,
        priority: input.priority ?? "normal",
      },
      dependencies.outboundMessagesRepository,
      input.timestamp
    )

    dependencies.logger.info(
      {
        jobId: context.jobId,
        runId: context.runId,
        chatId,
        phase: input.phase,
        dedupeKey,
        queueStatus: enqueueResult.status,
        queuedCount: enqueueResult.queuedCount,
        duplicateCount: enqueueResult.duplicateCount,
      },
      "Queued background lifecycle Telegram message"
    )
  } catch (error) {
    const err = error as Error
    dependencies.logger.warn(
      {
        jobId: context.jobId,
        runId: context.runId,
        phase: input.phase,
        error: err.message,
      },
      "Failed to enqueue background lifecycle Telegram message"
    )
  }
}

const executeWatchdogTask = async (
  dependencies: TaskExecutionEngineDependencies,
  job: ClaimedJobRecord,
  nowTimestamp: number
): Promise<TaskExecutionResult> => {
  await resolveJobExecutionSystemPrompt({
    dependencies,
    jobId: job.id,
    flow: "watchdog",
    payload: null,
    profileId: null,
  })

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
          result = await executeWatchdogTask(dependencies, job, startedAt)
        } else if (job.type === HEARTBEAT_TASK_TYPE) {
          const heartbeatResult = executeHeartbeatTask(
            {
              jobsRepository: dependencies.jobsRepository,
              outboundMessagesRepository: dependencies.outboundMessagesRepository,
              userProfileRepository: dependencies.userProfileRepository,
              defaultChatId: dependencies.defaultWatchdogChatId,
            },
            job.payload,
            startedAt
          )

          result = {
            status: heartbeatResult.status,
            summary: heartbeatResult.summary,
            errors: [],
          }
        } else if (job.type === INTERACTIVE_BACKGROUND_ONESHOT_JOB_TYPE) {
          const payloadParsed = parseTaskPayload(job.payload)
          if (payloadParsed.error) {
            result = toFailureResult("invalid_task_payload", payloadParsed.error)
          } else {
            const validatedPayload = interactiveBackgroundJobPayloadSchema.safeParse(
              payloadParsed.parsed
            )
            if (!validatedPayload.success) {
              result = toFailureResult("invalid_task_payload", validatedPayload.error.message)
            } else {
              const lifecycleContext: BackgroundLifecycleContext = {
                jobId: job.id,
                runId,
                sourceSessionId: validatedPayload.data.source.sessionId,
                sourceChatId: validatedPayload.data.source.chatId,
              }
              const baseConfig = await loadTaskRuntimeBaseConfig(dependencies.ottoHome)
              const profile = job.profileId
                ? await loadTaskProfile(dependencies.ottoHome, job.profileId)
                : undefined
              const effectiveConfig = buildEffectiveTaskExecutionConfig(
                baseConfig,
                "interactive",
                profile
              )
              const assistant = asRecord(asRecord(effectiveConfig.opencodeConfig.agent)?.assistant)
              const fallbackSystemPrompt =
                typeof assistant?.prompt === "string" ? assistant.prompt : undefined
              const systemPrompt = await resolveJobExecutionSystemPrompt({
                dependencies,
                jobId: job.id,
                flow: "background",
                payload: validatedPayload.data,
                profileId: job.profileId,
                fallbackSystemPrompt,
              })
              const tools = resolveTools(assistant?.tools)

              const sessionId = await dependencies.sessionGateway.ensureSession(null)
              dependencies.jobRunSessionsRepository.insert({
                runId,
                jobId: job.id,
                sessionId,
                createdAt: startedAt,
              })

              enqueueBackgroundLifecycleMessage(dependencies, lifecycleContext, {
                phase: "started",
                content: "Started your background run. I'll send milestone and final updates here.",
                priority: "normal",
                timestamp: startedAt,
              })

              let closeErrorMessage: string | null = null

              try {
                const assistantOutput = await dependencies.sessionGateway.promptSession(
                  sessionId,
                  buildInteractiveBackgroundPrompt(validatedPayload.data),
                  {
                    systemPrompt,
                    tools,
                    agent: "assistant",
                    modelContext: {
                      flow: "interactiveAssistant",
                      jobModelRef: job.modelRef,
                    },
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
                    "Interactive background execution returned non-conforming structured output"
                  )
                }

                result = parsedResult.result
                persistedRawOutput = parsedResult.rawOutput
              } catch (error) {
                const err = error as Error
                result = toFailureResult("task_execution_error", err.message)
              } finally {
                try {
                  if (dependencies.sessionGateway.closeSession) {
                    await dependencies.sessionGateway.closeSession(sessionId)
                  }
                } catch (error) {
                  const err = error as Error
                  closeErrorMessage = err.message
                  dependencies.logger.warn(
                    {
                      jobId: job.id,
                      runId,
                      sessionId,
                      error: err.message,
                    },
                    "Failed to close background run session"
                  )
                }

                dependencies.jobRunSessionsRepository.markClosed(runId, now(), closeErrorMessage)
              }

              const finalPhase =
                result.status === "success"
                  ? "final_success"
                  : result.status === "failed"
                    ? "final_failed"
                    : "final_skipped"
              const finalText =
                result.status === "success"
                  ? `Background run completed successfully: ${result.summary}`
                  : result.status === "failed"
                    ? `Background run failed: ${result.errors[0]?.message ?? result.summary}`
                    : `Background run finished as skipped: ${result.summary}`

              enqueueBackgroundLifecycleMessage(dependencies, lifecycleContext, {
                phase: finalPhase,
                content: finalText,
                priority: result.status === "failed" ? "high" : "normal",
                timestamp: now(),
              })
            }
          }
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
            const fallbackSystemPrompt =
              typeof assistant?.prompt === "string" ? assistant.prompt : undefined
            const systemPrompt = await resolveJobExecutionSystemPrompt({
              dependencies,
              jobId: job.id,
              flow: "scheduled",
              payload: payloadParsed.parsed,
              profileId: job.profileId,
              fallbackSystemPrompt,
            })
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
                modelContext: {
                  flow: "scheduledTasks",
                  jobModelRef: job.modelRef,
                },
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
