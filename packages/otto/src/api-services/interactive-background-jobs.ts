import { randomUUID } from "node:crypto"

import { z } from "zod"

import { createTaskMutation } from "./tasks-mutations.js"

export const INTERACTIVE_BACKGROUND_ONESHOT_JOB_TYPE = "interactive_background_oneshot"

const spawnInteractiveBackgroundJobInputSchema = z
  .object({
    request: z.string().trim().min(1),
    rationale: z.string().trim().min(1).max(500).optional(),
    prompt: z.string().trim().min(1).optional(),
    content: z.unknown().optional(),
    sessionId: z.string().trim().min(1).optional(),
    sourceMessageId: z.string().trim().min(1).optional(),
    chatId: z.number().int().positive().nullable().optional(),
    jobId: z.string().trim().min(1).optional(),
    actor: z.string().trim().min(1).optional(),
    source: z.enum(["internal_api", "external_api"]).optional(),
  })
  .superRefine((input, ctx) => {
    if (input.prompt !== undefined && input.content === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["content"],
        message: "content is required when prompt is provided",
      })
    }
  })

export const interactiveBackgroundJobPayloadSchema = z.object({
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
  input: z
    .object({
      prompt: z.string().trim().min(1),
      content: z.unknown(),
    })
    .optional(),
})

export type SpawnInteractiveBackgroundJobInput = z.input<
  typeof spawnInteractiveBackgroundJobInputSchema
>

export type InteractiveBackgroundJobPayload = z.infer<typeof interactiveBackgroundJobPayloadSchema>

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
  sessionId: string
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
  const prompt = parsedInput.prompt ?? parsedInput.request
  const sessionId = parsedInput.sessionId ?? randomUUID()

  const payload = interactiveBackgroundJobPayloadSchema.parse({
    version: 1,
    source: {
      surface: "interactive",
      sessionId,
      sourceMessageId: parsedInput.sourceMessageId ?? null,
      chatId: parsedInput.chatId ?? null,
    },
    request: {
      text: prompt,
      requestedAt: now,
      rationale: parsedInput.rationale ?? null,
    },
    input:
      parsedInput.prompt == null
        ? undefined
        : {
            prompt: parsedInput.prompt,
            content: parsedInput.content,
          },
  })

  const created = createTaskMutation(
    {
      jobsRepository: dependencies.jobsRepository,
      taskAuditRepository: dependencies.taskAuditRepository,
      now: () => now,
    },
    {
      id: parsedInput.jobId,
      type: INTERACTIVE_BACKGROUND_ONESHOT_JOB_TYPE,
      scheduleType: "oneshot",
      runAt: now,
      payload,
    },
    {
      lane: "interactive",
      actor: parsedInput.actor ?? "internal_tool",
      source: parsedInput.source ?? "internal_api",
    }
  )

  const jobId = created.id

  return {
    status: "queued",
    sessionId,
    jobId,
    jobType: INTERACTIVE_BACKGROUND_ONESHOT_JOB_TYPE,
    runAt: now,
    acknowledgement: `Got it - I started this as a background job. job_id: ${jobId}`,
  }
}
