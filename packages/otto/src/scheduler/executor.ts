import { randomUUID } from "node:crypto"

import type { Logger } from "pino"
import { z } from "zod"

import {
  INTERACTIVE_BACKGROUND_ONESHOT_JOB_TYPE,
  interactiveBackgroundJobPayloadSchema,
} from "../api-services/interactive-background-jobs.js"
import {
  PROMPT_ROUTE_MEDIA_VALUES,
  resolveJobSystemPrompt,
  type PromptProvenance,
  type PromptRouteMedia,
} from "../prompt-management/index.js"
import type {
  CommandAuditRecord,
  EodLearningRunArtifacts,
  InteractiveContextEventRecord,
  JobRecord,
  JobScheduleType,
  JobRunStatus,
  JobTerminalState,
  TaskAuditRecord,
  UserProfileRecord,
} from "../persistence/repositories.js"
import type { NonInteractiveContextCaptureService } from "../runtime/non-interactive-context-capture.js"
import type { OpencodeSessionGateway } from "../telegram-worker/opencode.js"
import { enqueueTelegramMessage } from "../telegram-worker/outbound-enqueue.js"
import {
  EOD_LEARNING_PROFILE_ID,
  EOD_LEARNING_TASK_ID,
  EOD_LEARNING_TASK_TYPE,
} from "./eod-learning.js"
import { evaluateEodLearningDecisions } from "./eod-learning/decision-engine.js"
import {
  buildEodLearningDigestInterpretationPrompt,
  buildEodLearningDigestMessage,
  parseEodLearningDigestMessage,
} from "./eod-learning/digest.js"
import { aggregateEodEvidenceBundle } from "./eod-learning/evidence-aggregation.js"
import { scheduleEodFollowUpActions } from "./eod-learning/follow-up-actions.js"
import {
  buildEodLearningApplyPrompt,
  buildEodLearningCandidatePrompt,
  eodLearningApplyOutputSchema,
  eodLearningCandidateOutputSchema,
  type EodLearningApplyOutput,
} from "./eod-learning/prompt.js"
import { resolveScheduleTransition } from "./schedule.js"
import {
  buildEffectiveTaskExecutionConfig,
  loadTaskProfile,
  loadTaskRuntimeBaseConfig,
} from "./task-config.js"
import {
  buildWatchdogFallbackMessage,
  enqueueWatchdogAlert,
  evaluateTaskFailures,
  WATCHDOG_TASK_TYPE,
  watchdogPayloadSchema,
} from "./watchdog.js"

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

const watchdogAlertMessageSchema = z.object({
  message: z.string().trim().min(1),
})

type WatchdogAlertMessageParseOutcome = {
  message: string | null
  rawOutput: string | null
  parseErrorCode: string | null
  parseErrorMessage: string | null
}

type JsonContractParseOutcome<T> = {
  value: T | null
  rawOutput: string | null
  parseErrorCode: string | null
  parseErrorMessage: string | null
}

type JsonContractRecoveryOutcome<T> = {
  value: T | null
  rawOutput: string | null
  parseErrorCode: string | null
  parseErrorMessage: string | null
  attempts: number
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
      promptProvenanceJson?: string | null
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
    setRunPromptProvenance?: (runId: string, promptProvenanceJson: string | null) => void
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
    listRunsByWindow?: (
      windowStart: number,
      windowEnd: number
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
    listTasks?: () => Array<{ id: string }>
    getById?: (jobId: string) => JobRecord | null
    createTask?: (record: JobRecord) => void
    updateTask?: (
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
    cancelTask?: (jobId: string, reason: string | null, updatedAt?: number) => void
    runTaskNow?: (jobId: string, scheduledFor: number, updatedAt?: number) => void
  }
  jobRunSessionsRepository: {
    insert: (record: {
      runId: string
      jobId: string
      sessionId: string
      createdAt: number
      promptProvenanceJson?: string | null
    }) => void
    markClosed: (runId: string, closedAt: number, closeErrorMessage: string | null) => void
    setPromptProvenance?: (runId: string, promptProvenanceJson: string | null) => void
  }
  sessionBindingsRepository: {
    getByBindingKey: (bindingKey: string) => { sessionId: string } | null
    getTelegramChatIdBySessionId: (sessionId: string) => number | null
    getSessionIdByTelegramChatId?: (chatId: number) => string | null
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
    get: () => UserProfileRecord | null
    setLastDigestAt: (lastDigestAt: number, updatedAt?: number) => void
  }
  taskAuditRepository?: {
    insert?: (record: TaskAuditRecord) => void
    listRecent: (limit?: number) => TaskAuditRecord[]
    listByCreatedWindow?: (windowStart: number, windowEnd: number) => TaskAuditRecord[]
  }
  commandAuditRepository?: {
    listRecent: (limit?: number) => CommandAuditRecord[]
    listByCreatedWindow?: (windowStart: number, windowEnd: number) => CommandAuditRecord[]
  }
  interactiveContextEventsRepository?: {
    listByCreatedWindow: (
      windowStart: number,
      windowEnd: number,
      limit?: number
    ) => InteractiveContextEventRecord[]
  }
  eodLearningRepository?: {
    insertRunWithArtifacts: (record: EodLearningRunArtifacts) => void
    listRecentRuns?: (limit?: number) => Array<{ id: string }>
    getRunDetails?: (runId: string) => EodLearningRunArtifacts | null
  }
  nonInteractiveContextCaptureService?: NonInteractiveContextCaptureService
  now?: () => number
}

type BackgroundLifecycleContext = {
  jobId: string
  runId: string
  sourceSessionId: string | null
  sourceChatId: number | null
}

const buildWatchdogAlertInterpretationPrompt = (input: {
  lookbackMinutes: number
  threshold: number
  failedCount: number
  failures: Array<{
    runId: string
    jobId: string
    jobType: string
    startedAt: number
    errorCode: string | null
    errorMessage: string | null
  }>
}): string => {
  return [
    "You are generating a concise watchdog alert message for Telegram.",
    "",
    "Return ONLY valid JSON with this exact shape:",
    '{"message":"<alert text>"}',
    "",
    "Rules for message:",
    "- One short headline line with count/lookback/threshold.",
    "- Then compact bullet lines grouping failure patterns by jobType + reason.",
    "- Max 8 bullet lines.",
    "- Keep it practical and non-alarmist.",
    "- No markdown code fences.",
    "",
    "Failure window data:",
    JSON.stringify(input),
  ].join("\n")
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

const resolveBackgroundTools = (value: unknown): Record<string, boolean> | undefined => {
  const tools = resolveTools(value)
  if (!tools) {
    return {
      spawn_background_job: false,
    }
  }

  return {
    ...tools,
    spawn_background_job: false,
  }
}

const hasErrnoCode = (error: unknown, code: string): boolean => {
  if (typeof error !== "object" || error === null) {
    return false
  }

  return (error as { code?: unknown }).code === code
}

const serializePromptProvenance = (provenance: PromptProvenance | null): string | null => {
  if (!provenance) {
    return null
  }

  return JSON.stringify(provenance)
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
}): Promise<{ systemPrompt: string | undefined; provenance: PromptProvenance | null }> => {
  try {
    const resolved = await resolveJobSystemPrompt({
      ottoHome: input.dependencies.ottoHome,
      flow: input.flow,
      media: input.flow === "watchdog" ? null : resolvePromptRouteMediaFromPayload(input.payload),
      profileId: input.profileId,
      logger: input.dependencies.logger,
    })

    if (resolved.systemPrompt.trim().length > 0) {
      input.dependencies.logger.info(
        {
          jobId: input.jobId,
          flow: input.flow,
          media: resolved.media,
          profileId: resolved.profileId,
          systemPrompt: resolved.systemPrompt,
          provenance: resolved.provenance,
          warnings: resolved.warnings,
        },
        "Resolved job execution system prompt"
      )

      return {
        systemPrompt: resolved.systemPrompt,
        provenance: resolved.provenance,
      }
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
    input.dependencies.logger.info(
      {
        jobId: input.jobId,
        flow: input.flow,
        profileId: input.profileId,
        systemPrompt: input.fallbackSystemPrompt,
      },
      "Using fallback task-config system prompt for job execution"
    )

    return {
      systemPrompt: input.fallbackSystemPrompt,
      provenance: null,
    }
  }

  return {
    systemPrompt: undefined,
    provenance: null,
  }
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

const parseWatchdogAlertMessage = (assistantText: string): WatchdogAlertMessageParseOutcome => {
  const trimmed = assistantText.trim()
  if (trimmed.length === 0) {
    return {
      message: null,
      rawOutput: null,
      parseErrorCode: "invalid_watchdog_alert_json",
      parseErrorMessage: "Watchdog alert output returned empty output",
    }
  }

  const validateParsedMessage = (parsed: unknown): WatchdogAlertMessageParseOutcome => {
    const validated = watchdogAlertMessageSchema.safeParse(parsed)
    if (!validated.success) {
      return {
        message: null,
        rawOutput: trimmed,
        parseErrorCode: "invalid_watchdog_alert_schema",
        parseErrorMessage: validated.error.message,
      }
    }

    return {
      message: validated.data.message,
      rawOutput: null,
      parseErrorCode: null,
      parseErrorMessage: null,
    }
  }

  try {
    return validateParsedMessage(JSON.parse(trimmed))
  } catch {
    const fencedMatch = trimmed.match(/```json\s*([\s\S]*?)\s*```/i)

    if (!fencedMatch?.[1]) {
      return {
        message: null,
        rawOutput: trimmed,
        parseErrorCode: "invalid_watchdog_alert_json",
        parseErrorMessage: "Watchdog alert output must be valid JSON",
      }
    }

    try {
      return validateParsedMessage(JSON.parse(fencedMatch[1]))
    } catch {
      return {
        message: null,
        rawOutput: trimmed,
        parseErrorCode: "invalid_watchdog_alert_json",
        parseErrorMessage: "Watchdog alert output must be valid JSON",
      }
    }
  }
}

const parseJsonObject = (assistantText: string): unknown => {
  const trimmed = assistantText.trim()
  if (trimmed.length === 0) {
    throw new Error("empty_output")
  }

  try {
    return JSON.parse(trimmed)
  } catch {
    const fencedMatch = trimmed.match(/```json\s*([\s\S]*?)\s*```/i)
    if (!fencedMatch?.[1]) {
      throw new Error("invalid_json")
    }

    return JSON.parse(fencedMatch[1])
  }
}

const parseEodCandidateOutput = (assistantText: string) => {
  const parsed = parseJsonObject(assistantText)
  return eodLearningCandidateOutputSchema.parse(parsed)
}

const parseEodApplyOutput = (assistantText: string): EodLearningApplyOutput => {
  const parsed = parseJsonObject(assistantText)
  return eodLearningApplyOutputSchema.parse(parsed)
}

const toJsonContractParseOutcome = <T>(
  parse: (assistantText: string) => T,
  assistantText: string,
  errorCodePrefix: string
): JsonContractParseOutcome<T> => {
  try {
    return {
      value: parse(assistantText),
      rawOutput: null,
      parseErrorCode: null,
      parseErrorMessage: null,
    }
  } catch (error) {
    const err = error as Error
    const message = err.message || "parse_failed"
    const parseErrorCode =
      message === "empty_output" || message === "invalid_json"
        ? `invalid_${errorCodePrefix}_json`
        : `invalid_${errorCodePrefix}_schema`

    return {
      value: null,
      rawOutput: assistantText.trim().length > 0 ? assistantText : null,
      parseErrorCode,
      parseErrorMessage: message,
    }
  }
}

const buildJsonRepairPrompt = (input: {
  basePrompt: string
  parseErrorCode: string
  parseErrorMessage: string
  rawOutput: string | null
  allowToolCalls: boolean
}): string => {
  return [
    "Your previous response failed strict JSON validation.",
    `Failure code: ${input.parseErrorCode}`,
    `Failure detail: ${input.parseErrorMessage}`,
    "Return ONLY valid JSON that satisfies the required schema from the task below.",
    "Do not include markdown, prose, or code fences.",
    input.allowToolCalls
      ? "If tool calls are needed to produce a correct result, execute them."
      : "Do not call tools. Only provide the corrected JSON output.",
    "",
    "Previous invalid response:",
    input.rawOutput ?? "<empty>",
    "",
    "Original task and schema:",
    input.basePrompt,
  ].join("\n")
}

const promptJsonWithRecovery = async <T>(input: {
  dependencies: TaskExecutionEngineDependencies
  sessionId: string
  basePrompt: string
  parse: (assistantText: string) => JsonContractParseOutcome<T>
  options: {
    systemPrompt?: string
    systemPromptProvenance?: PromptProvenance | null
    tools?: Record<string, boolean>
    agent?: string
    modelContext?: {
      flow: "scheduledTasks" | "watchdogFailures" | "interactiveAssistant"
      jobModelRef?: string | null
    }
  }
  maxAttempts?: number
  retryToolsMode?: "disabled" | "preserve"
  logContext: {
    phase:
      | "scheduled_task_result"
      | "background_task_result"
      | "watchdog_alert"
      | "eod_candidate"
      | "eod_apply"
      | "eod_digest"
    jobId: string
    runId?: string
  }
}): Promise<JsonContractRecoveryOutcome<T>> => {
  const attemptsLimit = Math.max(1, input.maxAttempts ?? 3)
  const retryToolsMode = input.retryToolsMode ?? "disabled"
  let attempt = 1
  let promptText = input.basePrompt

  while (attempt <= attemptsLimit) {
    const assistantOutput = await input.dependencies.sessionGateway.promptSession(
      input.sessionId,
      promptText,
      {
        ...input.options,
        tools:
          attempt === 1
            ? input.options.tools
            : retryToolsMode === "preserve"
              ? input.options.tools
              : {},
      }
    )

    const parsed = input.parse(assistantOutput)
    if (parsed.value !== null) {
      return {
        ...parsed,
        attempts: attempt,
      }
    }

    if (attempt < attemptsLimit) {
      input.dependencies.logger.warn(
        {
          ...input.logContext,
          sessionId: input.sessionId,
          attempt,
          maxAttempts: attemptsLimit,
          parseErrorCode: parsed.parseErrorCode,
          parseErrorMessage: parsed.parseErrorMessage,
          rawOutput: parsed.rawOutput,
        },
        "JSON contract parsing failed; retrying with repair prompt"
      )

      promptText = buildJsonRepairPrompt({
        basePrompt: input.basePrompt,
        parseErrorCode: parsed.parseErrorCode ?? "invalid_json_contract",
        parseErrorMessage: parsed.parseErrorMessage ?? "unknown parse failure",
        rawOutput: parsed.rawOutput,
        allowToolCalls: retryToolsMode === "preserve",
      })
      attempt += 1
      continue
    }

    input.dependencies.logger.error(
      {
        ...input.logContext,
        sessionId: input.sessionId,
        attempt,
        maxAttempts: attemptsLimit,
        parseErrorCode: parsed.parseErrorCode,
        parseErrorMessage: parsed.parseErrorMessage,
        rawOutput: parsed.rawOutput,
      },
      "JSON contract parsing failed after max attempts"
    )

    return {
      ...parsed,
      attempts: attempt,
    }
  }

  return {
    value: null,
    rawOutput: null,
    parseErrorCode: "invalid_json_contract",
    parseErrorMessage: "JSON contract parsing retry loop exhausted",
    attempts: attemptsLimit,
  }
}

const limitTools = (
  tools: Record<string, boolean> | undefined,
  allowedToolKeys: string[]
): Record<string, boolean> | undefined => {
  if (!tools) {
    return undefined
  }

  const allowed = new Set(allowedToolKeys)
  const entries = Object.entries(tools)
    .filter(([toolName, enabled]) => allowed.has(toolName) && enabled)
    .map(([toolName]) => [toolName, true] as const)

  if (entries.length === 0) {
    return {}
  }

  return Object.fromEntries(entries)
}

const toEodPolicyApplyStatus = (
  decision: string
): "applied" | "candidate_only" | "skipped" | "failed" => {
  if (
    decision === "auto_apply_memory_journal" ||
    decision === "auto_apply_memory_journal_high_confidence"
  ) {
    return "applied"
  }

  if (decision === "candidate_only_low_confidence") {
    return "candidate_only"
  }

  return "skipped"
}

const buildEodRunArtifacts = (input: {
  runId: string
  profileId: string | null
  windowStartedAt: number
  windowEndedAt: number
  startedAt: number
  finishedAt: number
  status: string
  summary: Record<string, unknown>
  items: Array<{
    id: string
    ordinal: number
    title: string
    decision: string
    confidence: number
    contradictionFlag: number
    expectedValue: number | null
    applyStatus: string
    applyError: string | null
    metadataJson: string | null
    evidenceRows: Array<{
      id: string
      ordinal: number
      signalGroup: string | null
      sourceKind: string
      sourceId: string
      occurredAt: number | null
      excerpt: string | null
      contradictionFlag: number
      metadataJson: string | null
    }>
    actionRows: Array<{
      id: string
      ordinal: number
      actionType: string
      status: string
      expectedValue: number | null
      detail: string | null
      errorMessage: string | null
      metadataJson: string | null
    }>
  }>
}): EodLearningRunArtifacts => {
  return {
    run: {
      id: input.runId,
      profileId: input.profileId,
      lane: "scheduled",
      windowStartedAt: input.windowStartedAt,
      windowEndedAt: input.windowEndedAt,
      startedAt: input.startedAt,
      finishedAt: input.finishedAt,
      status: input.status,
      summaryJson: JSON.stringify(input.summary),
      createdAt: input.startedAt,
    },
    items: input.items.map((item) => ({
      item: {
        id: item.id,
        runId: input.runId,
        ordinal: item.ordinal,
        title: item.title,
        decision: item.decision,
        confidence: item.confidence,
        contradictionFlag: item.contradictionFlag,
        expectedValue: item.expectedValue,
        applyStatus: item.applyStatus,
        applyError: item.applyError,
        metadataJson: item.metadataJson,
        createdAt: input.finishedAt,
      },
      evidence: item.evidenceRows.map((evidence) => ({
        id: evidence.id,
        runId: input.runId,
        itemId: item.id,
        ordinal: evidence.ordinal,
        signalGroup: evidence.signalGroup,
        sourceKind: evidence.sourceKind,
        sourceId: evidence.sourceId,
        occurredAt: evidence.occurredAt,
        excerpt: evidence.excerpt,
        contradictionFlag: evidence.contradictionFlag,
        metadataJson: evidence.metadataJson,
        createdAt: input.finishedAt,
      })),
      actions: item.actionRows.map((action) => ({
        id: action.id,
        runId: input.runId,
        itemId: item.id,
        ordinal: action.ordinal,
        actionType: action.actionType,
        status: action.status,
        expectedValue: action.expectedValue,
        detail: action.detail,
        errorMessage: action.errorMessage,
        metadataJson: action.metadataJson,
        createdAt: input.finishedAt,
      })),
    })),
  }
}

const collectFollowUpFingerprintsFromRun = (
  artifacts: EodLearningRunArtifacts | null
): Set<string> => {
  const fingerprints = new Set<string>()
  if (!artifacts) {
    return fingerprints
  }

  for (const item of artifacts.items) {
    for (const action of item.actions) {
      if (action.actionType !== "follow_up_schedule") {
        continue
      }

      if (action.status !== "success") {
        continue
      }

      if (!action.metadataJson) {
        continue
      }

      try {
        const parsed = JSON.parse(action.metadataJson) as Record<string, unknown>
        const fingerprint = parsed.fingerprint
        if (typeof fingerprint === "string" && fingerprint.trim().length > 0) {
          fingerprints.add(fingerprint)
        }
      } catch {
        continue
      }
    }
  }

  return fingerprints
}

const collectFollowUpFingerprintsFromTasks = (input: {
  listTasks?: () => Array<{ id: string }>
  getById?: (jobId: string) => Pick<JobRecord, "payload"> | null
}): Set<string> => {
  const fingerprints = new Set<string>()
  if (!input.listTasks || !input.getById) {
    return fingerprints
  }

  for (const task of input.listTasks()) {
    const record = input.getById(task.id)
    if (!record?.payload) {
      continue
    }

    try {
      const parsed = JSON.parse(record.payload) as Record<string, unknown>
      if (parsed.mode !== "eod_follow_up") {
        continue
      }

      const source = parsed.source as Record<string, unknown> | null
      const fingerprint = source?.fingerprint
      if (typeof fingerprint === "string" && fingerprint.trim().length > 0) {
        fingerprints.add(fingerprint)
      }
    } catch {
      continue
    }
  }

  return fingerprints
}

const executeEodLearningTask = async (input: {
  dependencies: TaskExecutionEngineDependencies
  job: ClaimedJobRecord
  runId: string
  startedAt: number
}): Promise<TaskExecutionResult> => {
  const windowEndedAt = input.startedAt
  const windowStartedAt = windowEndedAt - 24 * 60 * 60 * 1000

  try {
    const taskAudit =
      input.dependencies.taskAuditRepository?.listByCreatedWindow?.(
        windowStartedAt,
        windowEndedAt
      ) ??
      input.dependencies.taskAuditRepository?.listRecent(500) ??
      []
    const commandAudit =
      input.dependencies.commandAuditRepository?.listByCreatedWindow?.(
        windowStartedAt,
        windowEndedAt
      ) ??
      input.dependencies.commandAuditRepository?.listRecent(500) ??
      []
    const jobRuns =
      input.dependencies.jobsRepository.listRunsByWindow?.(windowStartedAt, windowEndedAt) ??
      input.dependencies.jobsRepository.listRecentRuns(windowStartedAt, 500)
    const interactiveContextEvents =
      input.dependencies.interactiveContextEventsRepository?.listByCreatedWindow(
        windowStartedAt,
        windowEndedAt
      ) ?? []

    const evidenceBundle = aggregateEodEvidenceBundle({
      windowStartedAt,
      windowEndedAt,
      taskAudit,
      commandAudit,
      jobRuns,
      interactiveContextEvents,
    })

    const baseConfig = await loadTaskRuntimeBaseConfig(input.dependencies.ottoHome)
    let profile = undefined
    if (input.job.profileId) {
      try {
        profile = await loadTaskProfile(input.dependencies.ottoHome, input.job.profileId)
      } catch (error) {
        if (
          input.job.id === EOD_LEARNING_TASK_ID &&
          input.job.profileId === EOD_LEARNING_PROFILE_ID &&
          hasErrnoCode(error, "ENOENT")
        ) {
          input.dependencies.logger.warn(
            {
              jobId: input.job.id,
              profileId: input.job.profileId,
            },
            "EOD profile config is missing; falling back to base scheduled task config. Run 'otto setup' to refresh workspace assets."
          )
        } else {
          throw error
        }
      }
    }

    const effectiveConfig = buildEffectiveTaskExecutionConfig(baseConfig, "scheduled", profile)
    const assistant = asRecord(asRecord(effectiveConfig.opencodeConfig.agent)?.assistant)
    const fallbackSystemPrompt =
      typeof assistant?.prompt === "string" ? assistant.prompt : undefined
    const promptResolution = await resolveJobExecutionSystemPrompt({
      dependencies: input.dependencies,
      jobId: input.job.id,
      flow: "scheduled",
      payload: {
        mode: "eod_learning",
        windowStartedAt,
        windowEndedAt,
      },
      profileId: input.job.profileId,
      fallbackSystemPrompt,
    })
    const runPromptProvenance = promptResolution.provenance
    input.dependencies.jobsRepository.setRunPromptProvenance?.(
      input.runId,
      serializePromptProvenance(runPromptProvenance)
    )

    const allTools = resolveTools(assistant?.tools)
    const applyTools = limitTools(allTools, ["memory_set", "memory_replace", "set_journal_tags"])

    const bindingKey = `scheduler:task:${input.job.id}:assistant`
    const existingBinding = input.dependencies.sessionBindingsRepository.getByBindingKey(bindingKey)
    const sessionId = await input.dependencies.sessionGateway.ensureSession(
      existingBinding?.sessionId ?? null
    )
    if (existingBinding?.sessionId !== sessionId) {
      input.dependencies.sessionBindingsRepository.upsert(bindingKey, sessionId, input.startedAt)
    }

    const candidatePrompt = buildEodLearningCandidatePrompt({
      runId: input.runId,
      windowStartedAt,
      windowEndedAt,
      evidenceBundle,
    })
    const candidateRecovery = await promptJsonWithRecovery({
      dependencies: input.dependencies,
      sessionId,
      basePrompt: candidatePrompt,
      parse: (assistantText) =>
        toJsonContractParseOutcome(parseEodCandidateOutput, assistantText, "eod_candidate"),
      options: {
        systemPrompt: promptResolution.systemPrompt,
        systemPromptProvenance: runPromptProvenance,
        tools: {},
        agent: "assistant",
        modelContext: {
          flow: "scheduledTasks",
          jobModelRef: input.job.modelRef,
        },
      },
      maxAttempts: 3,
      logContext: {
        phase: "eod_candidate",
        jobId: input.job.id,
        runId: input.runId,
      },
    })
    if (!candidateRecovery.value) {
      throw new Error(
        candidateRecovery.parseErrorCode && candidateRecovery.parseErrorMessage
          ? `${candidateRecovery.parseErrorCode}: ${candidateRecovery.parseErrorMessage}`
          : "invalid_eod_candidate_json"
      )
    }

    const parsedCandidates = candidateRecovery.value
    const decisions = evaluateEodLearningDecisions({
      candidates: parsedCandidates.candidates,
      evidenceBundle,
    })
    const evidenceById = new Map(evidenceBundle.evidence.map((entry) => [entry.id, entry]))
    const recentRunCandidates = input.dependencies.eodLearningRepository?.listRecentRuns?.(2) ?? []
    const previousRunId = recentRunCandidates.find((run) => run.id !== input.runId)?.id
    const priorArtifacts = previousRunId
      ? (input.dependencies.eodLearningRepository?.getRunDetails?.(previousRunId) ?? null)
      : null
    const followUpFingerprints = collectFollowUpFingerprintsFromRun(priorArtifacts)
    const persistedFollowUpFingerprints = collectFollowUpFingerprintsFromTasks({
      listTasks: input.dependencies.jobsRepository.listTasks,
      getById: input.dependencies.jobsRepository.getById,
    })
    for (const fingerprint of persistedFollowUpFingerprints) {
      followUpFingerprints.add(fingerprint)
    }
    let followUpMutationDependencies: {
      jobsRepository: {
        getById: NonNullable<TaskExecutionEngineDependencies["jobsRepository"]["getById"]>
        createTask: NonNullable<TaskExecutionEngineDependencies["jobsRepository"]["createTask"]>
        updateTask: NonNullable<TaskExecutionEngineDependencies["jobsRepository"]["updateTask"]>
        cancelTask: NonNullable<TaskExecutionEngineDependencies["jobsRepository"]["cancelTask"]>
        runTaskNow: NonNullable<TaskExecutionEngineDependencies["jobsRepository"]["runTaskNow"]>
      }
      taskAuditRepository: {
        insert: NonNullable<
          NonNullable<TaskExecutionEngineDependencies["taskAuditRepository"]>["insert"]
        >
      }
    } | null = null

    if (
      input.dependencies.taskAuditRepository?.insert &&
      input.dependencies.jobsRepository.getById &&
      input.dependencies.jobsRepository.createTask &&
      input.dependencies.jobsRepository.updateTask &&
      input.dependencies.jobsRepository.cancelTask &&
      input.dependencies.jobsRepository.runTaskNow
    ) {
      followUpMutationDependencies = {
        jobsRepository: {
          getById: input.dependencies.jobsRepository.getById,
          createTask: input.dependencies.jobsRepository.createTask,
          updateTask: input.dependencies.jobsRepository.updateTask,
          cancelTask: input.dependencies.jobsRepository.cancelTask,
          runTaskNow: input.dependencies.jobsRepository.runTaskNow,
        },
        taskAuditRepository: {
          insert: input.dependencies.taskAuditRepository.insert,
        },
      }
    }

    let followUpScheduledCount = 0
    let followUpSkippedCount = 0
    let followUpFailedCount = 0

    const persistedItems: Array<{
      id: string
      ordinal: number
      title: string
      decision: string
      confidence: number
      contradictionFlag: number
      expectedValue: number | null
      applyStatus: string
      applyError: string | null
      metadataJson: string | null
      evidenceRows: Array<{
        id: string
        ordinal: number
        signalGroup: string | null
        sourceKind: string
        sourceId: string
        occurredAt: number | null
        excerpt: string | null
        contradictionFlag: number
        metadataJson: string | null
      }>
      actionRows: Array<{
        id: string
        ordinal: number
        actionType: string
        status: string
        expectedValue: number | null
        detail: string | null
        errorMessage: string | null
        metadataJson: string | null
      }>
    }> = []

    for (const decision of decisions) {
      const itemId = randomUUID()
      const candidate = parsedCandidates.candidates[decision.ordinal]
      const referencedEvidenceEntries = decision.referencedEvidenceIds
        .map((evidenceId) => evidenceById.get(evidenceId))
        .filter((entry): entry is NonNullable<typeof entry> => entry != null)
      const evidenceRows = referencedEvidenceEntries.map((entry, index) => ({
        id: randomUUID(),
        ordinal: index,
        signalGroup: entry.signalGroup,
        sourceKind: entry.sourceKind,
        sourceId: entry.sourceId,
        occurredAt: entry.occurredAt,
        excerpt: entry.excerpt,
        contradictionFlag: decision.contradiction ? 1 : 0,
        metadataJson: JSON.stringify({
          evidenceId: entry.id,
          trace: entry.trace,
        }),
      }))

      const actionRows: Array<{
        id: string
        ordinal: number
        actionType: string
        status: string
        expectedValue: number | null
        detail: string | null
        errorMessage: string | null
        metadataJson: string | null
      }> = []

      let applyStatus = toEodPolicyApplyStatus(decision.decision)
      let applyError: string | null = null

      if (decision.applyEligible) {
        try {
          const applyPrompt = buildEodLearningApplyPrompt({
            runId: input.runId,
            itemId,
            candidate,
            evidence: referencedEvidenceEntries,
          })
          const applyRecovery = await promptJsonWithRecovery({
            dependencies: input.dependencies,
            sessionId,
            basePrompt: applyPrompt,
            parse: (assistantText) =>
              toJsonContractParseOutcome(parseEodApplyOutput, assistantText, "eod_apply"),
            options: {
              systemPrompt: promptResolution.systemPrompt,
              systemPromptProvenance: runPromptProvenance,
              tools: applyTools,
              agent: "assistant",
              modelContext: {
                flow: "scheduledTasks",
                jobModelRef: input.job.modelRef,
              },
            },
            maxAttempts: 3,
            retryToolsMode: "preserve",
            logContext: {
              phase: "eod_apply",
              jobId: input.job.id,
              runId: input.runId,
            },
          })
          if (!applyRecovery.value) {
            throw new Error(
              applyRecovery.parseErrorCode && applyRecovery.parseErrorMessage
                ? `${applyRecovery.parseErrorCode}: ${applyRecovery.parseErrorMessage}`
                : "invalid_eod_apply_json"
            )
          }

          const parsedApply = applyRecovery.value
          applyStatus = parsedApply.status === "success" ? "applied" : parsedApply.status
          applyError = parsedApply.status === "failed" ? parsedApply.summary : null
          const normalizedActions = parsedApply.actions.length
            ? parsedApply.actions
            : [
                {
                  actionType: "memory_journal_apply",
                  status: parsedApply.status,
                  detail: parsedApply.summary,
                  errorMessage: parsedApply.status === "failed" ? parsedApply.summary : null,
                  metadata: {},
                },
              ]

          actionRows.push(
            ...normalizedActions.map((action, actionIndex) => ({
              id: randomUUID(),
              ordinal: actionIndex,
              actionType: action.actionType,
              status: action.status,
              expectedValue: candidate.expectedValue,
              detail: action.detail,
              errorMessage: action.errorMessage,
              metadataJson: JSON.stringify(action.metadata),
            }))
          )
        } catch (error) {
          const err = error as Error
          applyStatus = "failed"
          applyError = err.message
          actionRows.push({
            id: randomUUID(),
            ordinal: 0,
            actionType: "memory_journal_apply",
            status: "failed",
            expectedValue: candidate.expectedValue,
            detail: null,
            errorMessage: err.message,
            metadataJson: null,
          })
        }
      } else {
        actionRows.push({
          id: randomUUID(),
          ordinal: 0,
          actionType: "policy_gate",
          status: "skipped",
          expectedValue: candidate.expectedValue,
          detail: decision.policyReason,
          errorMessage: null,
          metadataJson: JSON.stringify({
            decision: decision.decision,
            independentSignals: decision.independentSignals,
          }),
        })
      }

      const followUpOutcomes = scheduleEodFollowUpActions({
        runId: input.runId,
        itemId,
        decision,
        candidate,
        existingFingerprints: followUpFingerprints,
        mutationDependencies: followUpMutationDependencies,
        nowTimestamp: input.startedAt,
      })

      for (const outcome of followUpOutcomes) {
        if (outcome.status === "success") {
          followUpScheduledCount += 1
        }

        if (outcome.status === "skipped") {
          followUpSkippedCount += 1
        }

        if (outcome.status === "failed") {
          followUpFailedCount += 1
        }

        actionRows.push({
          id: randomUUID(),
          ordinal: actionRows.length,
          actionType: "follow_up_schedule",
          status: outcome.status,
          expectedValue: outcome.proposal.expectedValue,
          detail: outcome.detail,
          errorMessage: outcome.errorMessage,
          metadataJson: JSON.stringify({
            reasonCode: outcome.reasonCode,
            fingerprint: outcome.fingerprint,
            taskId: outcome.taskId,
            proposalTitle: outcome.proposal.title,
            proposalRationale: outcome.proposal.rationale,
            reversible: outcome.proposal.reversible,
            runId: input.runId,
            itemId,
          }),
        })
      }

      persistedItems.push({
        id: itemId,
        ordinal: decision.ordinal,
        title: decision.title,
        decision: decision.decision,
        confidence: decision.confidence,
        contradictionFlag: decision.contradiction ? 1 : 0,
        expectedValue: decision.expectedValue,
        applyStatus,
        applyError,
        metadataJson: JSON.stringify({
          policyReason: decision.policyReason,
          followUpEligible: decision.followUpEligible,
          rationale: candidate.rationale,
        }),
        evidenceRows,
        actionRows,
      })
    }

    const finishedAt = input.dependencies.now ? input.dependencies.now() : Date.now()
    const persistedArtifacts = buildEodRunArtifacts({
      runId: input.runId,
      profileId: input.job.profileId,
      windowStartedAt,
      windowEndedAt,
      startedAt: input.startedAt,
      finishedAt,
      status: "success",
      summary: {
        candidateCount: parsedCandidates.candidates.length,
        autoApplyCount: persistedItems.filter((item) => item.applyStatus === "applied").length,
        failedApplyCount: persistedItems.filter((item) => item.applyStatus === "failed").length,
        skippedCount: persistedItems.filter((item) => item.applyStatus === "skipped").length,
        followUpScheduledCount,
        followUpSkippedCount,
        followUpFailedCount,
      },
      items: persistedItems,
    })
    input.dependencies.eodLearningRepository?.insertRunWithArtifacts(persistedArtifacts)

    let digestMessageContent = buildEodLearningDigestMessage(persistedArtifacts)
    let digestMessageSource: "llm" | "fallback" = "fallback"

    try {
      const digestRecovery = await promptJsonWithRecovery({
        dependencies: input.dependencies,
        sessionId,
        basePrompt: buildEodLearningDigestInterpretationPrompt(persistedArtifacts),
        parse: (assistantText) => {
          const parsed = parseEodLearningDigestMessage(assistantText)
          return {
            value: parsed.message,
            rawOutput: parsed.rawOutput,
            parseErrorCode: parsed.parseErrorCode,
            parseErrorMessage: parsed.parseErrorMessage,
          }
        },
        options: {
          systemPrompt: promptResolution.systemPrompt,
          systemPromptProvenance: runPromptProvenance,
          tools: {},
          agent: "assistant",
          modelContext: {
            flow: "scheduledTasks",
            jobModelRef: input.job.modelRef,
          },
        },
        maxAttempts: 3,
        logContext: {
          phase: "eod_digest",
          jobId: input.job.id,
          runId: input.runId,
        },
      })

      const parsedDigest = {
        message: digestRecovery.value,
        rawOutput: digestRecovery.rawOutput,
        parseErrorCode: digestRecovery.parseErrorCode,
        parseErrorMessage: digestRecovery.parseErrorMessage,
      }
      if (parsedDigest.message) {
        digestMessageContent = parsedDigest.message
        digestMessageSource = "llm"
      } else {
        input.dependencies.logger.warn(
          {
            runId: input.runId,
            parseErrorCode: parsedDigest.parseErrorCode,
            parseErrorMessage: parsedDigest.parseErrorMessage,
            rawOutput: parsedDigest.rawOutput,
          },
          "EOD digest generation returned invalid output; using fallback formatter"
        )
      }
    } catch (error) {
      const err = error as Error
      input.dependencies.logger.warn(
        {
          runId: input.runId,
          error: err.message,
        },
        "EOD digest generation unavailable; using fallback formatter"
      )
    }

    try {
      enqueueEodLearningDigest(input.dependencies, {
        runId: input.runId,
        messageContent: digestMessageContent,
        timestamp: finishedAt,
      })
      input.dependencies.logger.info(
        {
          runId: input.runId,
          messageSource: digestMessageSource,
        },
        "Prepared EOD learning digest message"
      )
    } catch (error) {
      const err = error as Error
      input.dependencies.logger.warn(
        {
          runId: input.runId,
          error: err.message,
        },
        "Failed to enqueue EOD learning transparency digest"
      )
    }

    return {
      status: "success",
      summary: `EOD processed ${parsedCandidates.candidates.length} candidates (${persistedItems.filter((item) => item.applyStatus === "applied").length} auto-applied, ${persistedItems.filter((item) => item.applyStatus === "failed").length} failed, ${followUpScheduledCount} follow-ups scheduled)`,
      errors: [],
    }
  } catch (error) {
    const err = error as Error
    const finishedAt = input.dependencies.now ? input.dependencies.now() : Date.now()
    input.dependencies.eodLearningRepository?.insertRunWithArtifacts(
      buildEodRunArtifacts({
        runId: input.runId,
        profileId: input.job.profileId,
        windowStartedAt,
        windowEndedAt,
        startedAt: input.startedAt,
        finishedAt,
        status: "failed",
        summary: {
          error: err.message,
        },
        items: [],
      })
    )

    return toFailureResult("eod_learning_failed", err.message)
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
  const promptText = payload.input?.prompt ?? payload.request.text
  const serializedContent =
    payload.input === undefined ? null : JSON.stringify(payload.input.content, null, 2)

  return [
    "Execute this interactive background request now.",
    "Work autonomously and do not ask clarifying questions.",
    "When useful, call report_background_milestone with concise free-text phase updates.",
    "Do not spam milestone updates; call it only on meaningful phase changes.",
    "Return only a JSON object with keys: status, summary, errors.",
    "status must be one of: success, failed, skipped.",
    "Do not include markdown.",
    "",
    promptText,
    ...(serializedContent === null ? [] : ["", "Payload JSON:", serializedContent]),
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

const resolveBackgroundLifecycleSourceSessionId = (
  dependencies: TaskExecutionEngineDependencies,
  context: BackgroundLifecycleContext,
  chatId: number
): string | null => {
  if (context.sourceSessionId) {
    return context.sourceSessionId
  }

  return dependencies.sessionBindingsRepository.getSessionIdByTelegramChatId?.(chatId) ?? null
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

    dependencies.nonInteractiveContextCaptureService?.captureQueuedTextMessage({
      sourceSessionId: resolveBackgroundLifecycleSourceSessionId(dependencies, context, chatId),
      sourceLane: "scheduler",
      sourceKind: "background_lifecycle",
      sourceRef: `${context.jobId}:${context.runId}:${input.phase}`,
      content: input.content,
      messageIds: enqueueResult.messageIds,
      enqueueStatus: enqueueResult.status,
      timestamp: input.timestamp,
    })

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

const enqueueEodLearningDigest = (
  dependencies: TaskExecutionEngineDependencies,
  input: {
    runId: string
    messageContent: string
    timestamp: number
  }
): void => {
  const chatId = dependencies.defaultWatchdogChatId
  if (!chatId) {
    dependencies.logger.info(
      {
        runId: input.runId,
      },
      "Skipped EOD learning digest enqueue because chat id is not configured"
    )
    return
  }

  const dedupeKey = `eod-learning-digest:${input.runId}`
  const enqueueResult = enqueueTelegramMessage(
    {
      chatId,
      content: input.messageContent,
      dedupeKey,
      priority: "normal",
    },
    dependencies.outboundMessagesRepository,
    input.timestamp
  )

  dependencies.nonInteractiveContextCaptureService?.captureQueuedTextMessage({
    sourceSessionId:
      dependencies.sessionBindingsRepository.getSessionIdByTelegramChatId?.(chatId) ?? null,
    sourceLane: "scheduler",
    sourceKind: "eod_learning_digest",
    sourceRef: input.runId,
    content: input.messageContent,
    messageIds: enqueueResult.messageIds,
    enqueueStatus: enqueueResult.status,
    timestamp: input.timestamp,
  })

  dependencies.logger.info(
    {
      runId: input.runId,
      chatId,
      dedupeKey,
      queueStatus: enqueueResult.status,
      queuedCount: enqueueResult.queuedCount,
      duplicateCount: enqueueResult.duplicateCount,
    },
    "Queued EOD learning transparency digest"
  )
}

const executeWatchdogTask = async (
  dependencies: TaskExecutionEngineDependencies,
  job: ClaimedJobRecord,
  nowTimestamp: number,
  watchdogSystemPrompt: string,
  watchdogPromptProvenance: PromptProvenance | null
): Promise<TaskExecutionResult> => {
  const payloadParsed = parseTaskPayload(job.payload)
  if (payloadParsed.error) {
    return toFailureResult("invalid_watchdog_payload", payloadParsed.error)
  }

  const validatedPayload = watchdogPayloadSchema.safeParse(payloadParsed.parsed ?? {})
  if (!validatedPayload.success) {
    return toFailureResult("invalid_watchdog_payload", validatedPayload.error.message)
  }

  const evaluation = evaluateTaskFailures(
    {
      jobsRepository: dependencies.jobsRepository,
      defaultChatId: dependencies.defaultWatchdogChatId,
    },
    {
      ...validatedPayload.data,
      excludeTaskTypes: [WATCHDOG_TASK_TYPE],
    },
    () => nowTimestamp
  )

  const profile = dependencies.userProfileRepository.get()
  const watchdogAlertsEnabled = profile?.watchdogAlertsEnabled ?? true
  const watchdogMuted =
    profile?.watchdogMuteUntil != null && profile.watchdogMuteUntil > nowTimestamp

  if (
    evaluation.shouldAlert &&
    validatedPayload.data.notify &&
    watchdogAlertsEnabled &&
    !watchdogMuted &&
    !evaluation.resolvedChatId
  ) {
    return toFailureResult(
      "watchdog_notification_unavailable",
      "Watchdog detected failures but no Telegram chat id is configured for alerts"
    )
  }

  let notificationStatus: "not_requested" | "enqueued" | "duplicate" | "no_chat_id" =
    "not_requested"
  let watchdogMessageSource: "llm" | "fallback" | "none" = "none"

  if (evaluation.notifyRequested && evaluation.shouldAlert) {
    if (!watchdogAlertsEnabled || watchdogMuted) {
      const disabledReason = !watchdogAlertsEnabled ? "disabled" : "muted"
      return {
        status: "success",
        summary: `Watchdog checked ${evaluation.failedCount} failed runs (notification skipped: ${disabledReason})`,
        errors: [],
      }
    }

    let messageContent = buildWatchdogFallbackMessage(
      evaluation.failures,
      evaluation.lookbackMinutes,
      evaluation.threshold
    )
    watchdogMessageSource = "fallback"

    if (watchdogSystemPrompt.trim().length > 0) {
      try {
        const bindingKey = `scheduler:task:${job.id}:assistant`
        const existingBinding = dependencies.sessionBindingsRepository.getByBindingKey(bindingKey)
        const sessionId = await dependencies.sessionGateway.ensureSession(
          existingBinding?.sessionId ?? null
        )

        if (existingBinding?.sessionId !== sessionId) {
          dependencies.sessionBindingsRepository.upsert(bindingKey, sessionId, nowTimestamp)
        }

        const parsedAlertRecovery = await promptJsonWithRecovery({
          dependencies,
          sessionId,
          basePrompt: buildWatchdogAlertInterpretationPrompt({
            lookbackMinutes: evaluation.lookbackMinutes,
            threshold: evaluation.threshold,
            failedCount: evaluation.failedCount,
            failures: evaluation.failures,
          }),
          parse: (assistantText) => {
            const parsed = parseWatchdogAlertMessage(assistantText)
            return {
              value: parsed.message,
              rawOutput: parsed.rawOutput,
              parseErrorCode: parsed.parseErrorCode,
              parseErrorMessage: parsed.parseErrorMessage,
            }
          },
          options: {
            systemPrompt: watchdogSystemPrompt,
            systemPromptProvenance: watchdogPromptProvenance,
            agent: "assistant",
            modelContext: {
              flow: "watchdogFailures",
              jobModelRef: job.modelRef,
            },
          },
          maxAttempts: 3,
          logContext: {
            phase: "watchdog_alert",
            jobId: job.id,
          },
        })

        const parsedAlert = {
          message: parsedAlertRecovery.value,
          rawOutput: parsedAlertRecovery.rawOutput,
          parseErrorCode: parsedAlertRecovery.parseErrorCode,
          parseErrorMessage: parsedAlertRecovery.parseErrorMessage,
        }
        if (parsedAlert.message) {
          messageContent = parsedAlert.message
          watchdogMessageSource = "llm"
        } else {
          dependencies.logger.warn(
            {
              jobId: job.id,
              parseErrorCode: parsedAlert.parseErrorCode,
              parseErrorMessage: parsedAlert.parseErrorMessage,
              rawOutput: parsedAlert.rawOutput,
            },
            "Watchdog alert generation returned invalid output; using fallback formatter"
          )
        }
      } catch (error) {
        const err = error as Error
        dependencies.logger.warn(
          {
            jobId: job.id,
            error: err.message,
          },
          "Watchdog alert generation unavailable; using fallback formatter"
        )
      }
    }

    const enqueueResult = enqueueWatchdogAlert(
      {
        outboundMessagesRepository: dependencies.outboundMessagesRepository,
        sessionBindingsRepository: dependencies.sessionBindingsRepository,
        nonInteractiveContextCaptureService: dependencies.nonInteractiveContextCaptureService,
      },
      {
        chatId: evaluation.resolvedChatId,
        dedupeKey: evaluation.dedupeKey,
        messageContent,
        nowTimestamp,
      }
    )
    notificationStatus = enqueueResult.notificationStatus
  }

  const notificationSummary =
    notificationStatus === "not_requested"
      ? "notification skipped"
      : `notification ${notificationStatus}${watchdogMessageSource === "none" ? "" : ` (${watchdogMessageSource})`}`

  return {
    status: "success",
    summary: `Watchdog checked ${evaluation.failedCount} failed runs (${notificationSummary})`,
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
        promptProvenanceJson: null,
        createdAt: startedAt,
      })

      let result: TaskExecutionResult
      let persistedRawOutput: string | null = null
      let runPromptProvenance: PromptProvenance | null = null

      try {
        if (job.type === WATCHDOG_TASK_TYPE) {
          const promptResolution = await resolveJobExecutionSystemPrompt({
            dependencies,
            jobId: job.id,
            flow: "watchdog",
            payload: null,
            profileId: null,
          })
          runPromptProvenance = promptResolution.provenance
          dependencies.jobsRepository.setRunPromptProvenance?.(
            runId,
            serializePromptProvenance(runPromptProvenance)
          )
          result = await executeWatchdogTask(
            dependencies,
            job,
            startedAt,
            promptResolution.systemPrompt ?? "",
            runPromptProvenance
          )
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
              const promptResolution = await resolveJobExecutionSystemPrompt({
                dependencies,
                jobId: job.id,
                flow: "background",
                payload: validatedPayload.data,
                profileId: job.profileId,
                fallbackSystemPrompt,
              })
              const systemPrompt = promptResolution.systemPrompt
              runPromptProvenance = promptResolution.provenance
              const serializedPromptProvenance = serializePromptProvenance(runPromptProvenance)
              dependencies.jobsRepository.setRunPromptProvenance?.(
                runId,
                serializedPromptProvenance
              )
              const tools = resolveBackgroundTools(assistant?.tools)

              const sessionId = await dependencies.sessionGateway.ensureSession(null)
              dependencies.jobRunSessionsRepository.insert({
                runId,
                jobId: job.id,
                sessionId,
                createdAt: startedAt,
                ...(serializedPromptProvenance
                  ? { promptProvenanceJson: serializedPromptProvenance }
                  : {}),
              })
              dependencies.jobRunSessionsRepository.setPromptProvenance?.(
                runId,
                serializedPromptProvenance
              )

              enqueueBackgroundLifecycleMessage(dependencies, lifecycleContext, {
                phase: "started",
                content: "Started your background run. I'll send milestone and final updates here.",
                priority: "normal",
                timestamp: startedAt,
              })

              let closeErrorMessage: string | null = null

              try {
                const parsedResultRecovery = await promptJsonWithRecovery({
                  dependencies,
                  sessionId,
                  basePrompt: buildInteractiveBackgroundPrompt(validatedPayload.data),
                  parse: (assistantText) => {
                    const parsed = parseStructuredResult(assistantText)
                    return {
                      value: parsed.parseErrorCode ? null : parsed.result,
                      rawOutput: parsed.rawOutput,
                      parseErrorCode: parsed.parseErrorCode,
                      parseErrorMessage: parsed.parseErrorMessage,
                    }
                  },
                  options: {
                    systemPrompt,
                    systemPromptProvenance: runPromptProvenance,
                    tools,
                    agent: "assistant",
                    modelContext: {
                      flow: "interactiveAssistant",
                      jobModelRef: job.modelRef,
                    },
                  },
                  maxAttempts: 3,
                  retryToolsMode: "preserve",
                  logContext: {
                    phase: "background_task_result",
                    jobId: job.id,
                    runId,
                  },
                })

                const parsedResult: TaskExecutionParseOutcome = parsedResultRecovery.value
                  ? {
                      result: parsedResultRecovery.value,
                      rawOutput: null,
                      parseErrorCode: null,
                      parseErrorMessage: null,
                    }
                  : {
                      result: toFailureResult(
                        parsedResultRecovery.parseErrorCode ?? "invalid_result_json",
                        parsedResultRecovery.parseErrorMessage ??
                          "Task execution output must be valid JSON"
                      ),
                      rawOutput: parsedResultRecovery.rawOutput,
                      parseErrorCode: parsedResultRecovery.parseErrorCode,
                      parseErrorMessage: parsedResultRecovery.parseErrorMessage,
                    }
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
        } else if (job.type === EOD_LEARNING_TASK_TYPE) {
          result = await executeEodLearningTask({
            dependencies,
            job,
            runId,
            startedAt,
          })
        } else {
          const payloadParsed = parseTaskPayload(job.payload)
          if (payloadParsed.error) {
            result = toFailureResult("invalid_task_payload", payloadParsed.error)
          } else {
            const baseConfig = await loadTaskRuntimeBaseConfig(dependencies.ottoHome)
            let profile = undefined
            if (job.profileId) {
              try {
                profile = await loadTaskProfile(dependencies.ottoHome, job.profileId)
              } catch (error) {
                if (
                  job.id === EOD_LEARNING_TASK_ID &&
                  job.profileId === EOD_LEARNING_PROFILE_ID &&
                  hasErrnoCode(error, "ENOENT")
                ) {
                  dependencies.logger.warn(
                    {
                      jobId: job.id,
                      profileId: job.profileId,
                    },
                    "EOD profile config is missing; falling back to base scheduled task config. Run 'otto setup' to refresh workspace assets."
                  )
                } else {
                  throw error
                }
              }
            }
            const effectiveConfig = buildEffectiveTaskExecutionConfig(
              baseConfig,
              "scheduled",
              profile
            )
            const assistant = asRecord(asRecord(effectiveConfig.opencodeConfig.agent)?.assistant)
            const fallbackSystemPrompt =
              typeof assistant?.prompt === "string" ? assistant.prompt : undefined
            const promptResolution = await resolveJobExecutionSystemPrompt({
              dependencies,
              jobId: job.id,
              flow: "scheduled",
              payload: payloadParsed.parsed,
              profileId: job.profileId,
              fallbackSystemPrompt,
            })
            const systemPrompt = promptResolution.systemPrompt
            runPromptProvenance = promptResolution.provenance
            dependencies.jobsRepository.setRunPromptProvenance?.(
              runId,
              serializePromptProvenance(runPromptProvenance)
            )
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

            const parsedResultRecovery = await promptJsonWithRecovery({
              dependencies,
              sessionId,
              basePrompt: buildExecutionPrompt(job, payloadParsed.parsed, startedAt),
              parse: (assistantText) => {
                const parsed = parseStructuredResult(assistantText)
                return {
                  value: parsed.parseErrorCode ? null : parsed.result,
                  rawOutput: parsed.rawOutput,
                  parseErrorCode: parsed.parseErrorCode,
                  parseErrorMessage: parsed.parseErrorMessage,
                }
              },
              options: {
                systemPrompt,
                systemPromptProvenance: runPromptProvenance,
                tools,
                agent: "assistant",
                modelContext: {
                  flow: "scheduledTasks",
                  jobModelRef: job.modelRef,
                },
              },
              maxAttempts: 3,
              retryToolsMode: "preserve",
              logContext: {
                phase: "scheduled_task_result",
                jobId: job.id,
                runId,
              },
            })

            const parsedResult: TaskExecutionParseOutcome = parsedResultRecovery.value
              ? {
                  result: parsedResultRecovery.value,
                  rawOutput: null,
                  parseErrorCode: null,
                  parseErrorMessage: null,
                }
              : {
                  result: toFailureResult(
                    parsedResultRecovery.parseErrorCode ?? "invalid_result_json",
                    parsedResultRecovery.parseErrorMessage ??
                      "Task execution output must be valid JSON"
                  ),
                  rawOutput: parsedResultRecovery.rawOutput,
                  parseErrorCode: parsedResultRecovery.parseErrorCode,
                  parseErrorMessage: parsedResultRecovery.parseErrorMessage,
                }
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
