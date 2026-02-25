import { z } from "zod"

import { createTaskMutation } from "./tasks-mutations.js"

export const INTERACTIVE_BACKGROUND_ONESHOT_JOB_TYPE = "interactive_background_oneshot"

const spawnInteractiveBackgroundJobInputSchema = z.object({
  request: z.string().trim().min(1),
  rationale: z.string().trim().min(1).max(500).optional(),
  sessionId: z.string().trim().min(1).optional(),
  sourceMessageId: z.string().trim().min(1).optional(),
  chatId: z.number().int().positive().nullable().optional(),
})

const interactiveBackgroundJobPayloadSchema = z.object({
  version: z.literal(1),
  source: z.object({
    surface: z.literal("interactive"),
    sessionId: z.string().trim().min(1).nullable(),
    sourceMessageId: z.string().trim().min(1).nullable(),
    chatId: z.number().int().positive().nullable(),
  }),
  request: z.object({
    text: z.string().trim().min(1),
    requestedAt: z.number().int(),
    rationale: z.string().trim().min(1).max(500).nullable(),
  }),
})

export type SpawnInteractiveBackgroundJobInput = z.input<
  typeof spawnInteractiveBackgroundJobInputSchema
>

type SpawnBackgroundJobDependencies = {
  jobsRepository: {
    getById: Parameters<typeof createTaskMutation>[0]["jobsRepository"]["getById"]
    createTask: Parameters<typeof createTaskMutation>[0]["jobsRepository"]["createTask"]
    updateTask: Parameters<typeof createTaskMutation>[0]["jobsRepository"]["updateTask"]
    cancelTask: Parameters<typeof createTaskMutation>[0]["jobsRepository"]["cancelTask"]
    runTaskNow: Parameters<typeof createTaskMutation>[0]["jobsRepository"]["runTaskNow"]
  }
  taskAuditRepository: {
    insert: Parameters<typeof createTaskMutation>[0]["taskAuditRepository"]["insert"]
  }
  now?: () => number
}

export type SpawnInteractiveBackgroundJobResult = {
  status: "queued"
  jobId: string
  jobType: string
  runAt: number
  acknowledgement: string
}

/**
 * Creates a dedicated interactive background one-shot job so long-running user requests can
 * continue asynchronously without blocking the parent interactive session.
 *
 * @param dependencies Task mutation dependencies backed by Otto persistence repositories.
 * @param input Tool/API input describing the request to execute in background.
 * @returns Background job identity and an acknowledgement message for the user.
 */
export const spawnInteractiveBackgroundJob = (
  dependencies: SpawnBackgroundJobDependencies,
  input: SpawnInteractiveBackgroundJobInput
): SpawnInteractiveBackgroundJobResult => {
  const parsedInput = spawnInteractiveBackgroundJobInputSchema.parse(input)
  const now = (dependencies.now ?? Date.now)()

  const payload = interactiveBackgroundJobPayloadSchema.parse({
    version: 1,
    source: {
      surface: "interactive",
      sessionId: parsedInput.sessionId ?? null,
      sourceMessageId: parsedInput.sourceMessageId ?? null,
      chatId: parsedInput.chatId ?? null,
    },
    request: {
      text: parsedInput.request,
      requestedAt: now,
      rationale: parsedInput.rationale ?? null,
    },
  })

  const created = createTaskMutation(
    {
      jobsRepository: dependencies.jobsRepository,
      taskAuditRepository: dependencies.taskAuditRepository,
      now: () => now,
    },
    {
      type: INTERACTIVE_BACKGROUND_ONESHOT_JOB_TYPE,
      scheduleType: "oneshot",
      runAt: now,
      payload,
    },
    {
      lane: "interactive",
      actor: "internal_tool",
      source: "internal_api",
    }
  )

  const jobId = created.id

  return {
    status: "queued",
    jobId,
    jobType: INTERACTIVE_BACKGROUND_ONESHOT_JOB_TYPE,
    runAt: now,
    acknowledgement: `Got it - I started this as a background job. job_id: ${jobId}`,
  }
}
