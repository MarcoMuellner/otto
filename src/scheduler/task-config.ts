import path from "node:path"
import { readFile } from "node:fs/promises"

import { parse as parseJsonc } from "jsonc-parser"
import { z } from "zod"

export type TaskExecutionLane = "interactive" | "scheduled"

export type TaskExecutionConfig = {
  opencodeConfig: Record<string, unknown>
}

const opencodeFragmentSchema = z.record(z.string(), z.unknown())

const taskLaneOverlaySchema = z.object({
  opencode: opencodeFragmentSchema,
})

const taskRuntimeBaseConfigSchema = z.object({
  version: z.literal(1),
  base: taskLaneOverlaySchema,
  lanes: z
    .object({
      interactive: taskLaneOverlaySchema.optional(),
      scheduled: taskLaneOverlaySchema.optional(),
    })
    .default({}),
})

const taskProfileSchema = z.object({
  version: z.literal(1),
  id: z.string().trim().min(1),
  description: z.string().optional(),
  laneOverrides: z
    .object({
      interactive: taskLaneOverlaySchema.optional(),
      scheduled: taskLaneOverlaySchema.optional(),
    })
    .default({}),
})

export type TaskRuntimeBaseConfig = z.infer<typeof taskRuntimeBaseConfigSchema>
export type TaskProfile = z.infer<typeof taskProfileSchema>

const TASK_CONFIG_DIRECTORY_NAME = "task-config"
const BASE_CONFIG_FILE_NAME = "base.jsonc"
const PROFILES_DIRECTORY_NAME = "profiles"

const parseJsonFile = <T>(source: string, schema: z.ZodSchema<T>, filePath: string): T => {
  const parseErrors: Array<{
    error: number
    offset: number
    length: number
  }> = []

  const parsed = parseJsonc(source, parseErrors, {
    allowTrailingComma: true,
    disallowComments: false,
  })

  if (parseErrors.length > 0) {
    throw new Error(`Invalid JSONC in task config file: ${filePath}`)
  }

  const validated = schema.safeParse(parsed)
  if (!validated.success) {
    const detail = validated.error.issues
      .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
      .join("; ")
    throw new Error(`Invalid task config in ${filePath}: ${detail}`)
  }

  return validated.data
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

const mergeRecords = (
  base: Record<string, unknown>,
  override: Record<string, unknown>
): Record<string, unknown> => {
  const merged: Record<string, unknown> = { ...base }

  for (const [key, overrideValue] of Object.entries(override)) {
    const baseValue = merged[key]

    if (isRecord(baseValue) && isRecord(overrideValue)) {
      merged[key] = mergeRecords(baseValue, overrideValue)
      continue
    }

    merged[key] = overrideValue
  }

  return merged
}

/**
 * Resolves the directory that stores task runtime config and profile files in Otto home.
 *
 * @param ottoHome Otto workspace root.
 * @returns Absolute task config directory path.
 */
export const resolveTaskConfigDirectory = (ottoHome: string): string => {
  return path.join(ottoHome, TASK_CONFIG_DIRECTORY_NAME)
}

/**
 * Loads the base task runtime config containing global defaults and lane-specific overlays.
 *
 * @param ottoHome Otto workspace root.
 * @returns Parsed base task runtime config.
 */
export const loadTaskRuntimeBaseConfig = async (
  ottoHome: string
): Promise<TaskRuntimeBaseConfig> => {
  const directory = resolveTaskConfigDirectory(ottoHome)
  const filePath = path.join(directory, BASE_CONFIG_FILE_NAME)
  const source = await readFile(filePath, "utf8")

  return parseJsonFile(source, taskRuntimeBaseConfigSchema, filePath)
}

/**
 * Loads a task profile by id so lane-specific OpenCode overlays can be applied per task.
 *
 * @param ottoHome Otto workspace root.
 * @param profileId Profile identifier matching file and config id.
 * @returns Parsed task profile.
 */
export const loadTaskProfile = async (
  ottoHome: string,
  profileId: string
): Promise<TaskProfile> => {
  const directory = resolveTaskConfigDirectory(ottoHome)
  const filePath = path.join(directory, PROFILES_DIRECTORY_NAME, `${profileId}.jsonc`)
  const source = await readFile(filePath, "utf8")
  const profile = parseJsonFile(source, taskProfileSchema, filePath)

  if (profile.id !== profileId) {
    throw new Error(
      `Task profile id mismatch in ${filePath}: expected '${profileId}', got '${profile.id}'`
    )
  }

  return profile
}

/**
 * Builds effective task execution config by layering global base config, lane overlay, and
 * profile lane override in deterministic merge order.
 *
 * @param baseConfig Base runtime config loaded from task-config/base.jsonc.
 * @param lane Execution lane (`interactive` or `scheduled`).
 * @param profile Optional task profile for lane-specific overrides.
 * @returns Effective merged OpenCode config fragment.
 */
export const buildEffectiveTaskExecutionConfig = (
  baseConfig: TaskRuntimeBaseConfig,
  lane: TaskExecutionLane,
  profile?: TaskProfile
): TaskExecutionConfig => {
  const laneOverride = baseConfig.lanes[lane]?.opencode ?? {}
  const profileLaneOverride = profile?.laneOverrides[lane]?.opencode ?? {}

  const withLane = mergeRecords(baseConfig.base.opencode, laneOverride)
  const opencodeConfig = mergeRecords(withLane, profileLaneOverride)

  return {
    opencodeConfig,
  }
}
