import { homedir } from "node:os"
import path from "node:path"
import { mkdir, readFile, writeFile } from "node:fs/promises"

import { z } from "zod"

const MEMORY_TAG_SCHEMA = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().min(1),
})

export type AgentMemoryTag = z.infer<typeof MEMORY_TAG_SCHEMA>

const DEFAULT_JOURNAL_TAGS: AgentMemoryTag[] = [
  {
    name: "priorities",
    description: "What matters most right now and why",
  },
  {
    name: "risks",
    description: "Conflicts, blockers, and failure patterns to watch",
  },
  {
    name: "follow-ups",
    description: "Concrete next actions and open loops",
  },
  {
    name: "decisions",
    description: "Chosen plans and tradeoffs",
  },
  {
    name: "preferences",
    description: "Observed user preferences and constraints to validate",
  },
  {
    name: "routines",
    description: "Recurring habits, timing cues, and personal patterns",
  },
]

export type EnsureAgentMemoryJournalConfigResult = {
  configPath: string
  created: boolean
  updated: boolean
}

const AGENT_MEMORY_RELATIVE_PATH = path.join(".config", "opencode", "agent-memory.json")

/**
 * Resolves the persisted agent-memory config location so setup and tooling consistently
 * manage the same file across local and bundled installs.
 *
 * @param homeDirectory Optional home directory override used by tests.
 * @returns Absolute path to the agent-memory.json file.
 */
export const resolveAgentMemoryConfigPath = (homeDirectory = homedir()): string => {
  return path.join(homeDirectory, AGENT_MEMORY_RELATIVE_PATH)
}

const parseExistingConfig = (source: string, configPath: string): Record<string, unknown> => {
  let parsed: unknown

  try {
    parsed = JSON.parse(source)
  } catch {
    throw new Error(`Invalid JSON in agent-memory config: ${configPath}`)
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Agent-memory config at ${configPath} must be a JSON object`)
  }

  return { ...(parsed as Record<string, unknown>) }
}

const mergeTags = (existingTags: unknown): AgentMemoryTag[] => {
  const mergedByName = new Map<string, AgentMemoryTag>()

  if (Array.isArray(existingTags)) {
    for (const candidate of existingTags) {
      const parsed = MEMORY_TAG_SCHEMA.safeParse(candidate)
      if (!parsed.success) {
        continue
      }

      mergedByName.set(parsed.data.name.toLowerCase(), parsed.data)
    }
  }

  for (const defaultTag of DEFAULT_JOURNAL_TAGS) {
    if (!mergedByName.has(defaultTag.name.toLowerCase())) {
      mergedByName.set(defaultTag.name.toLowerCase(), defaultTag)
    }
  }

  return Array.from(mergedByName.values())
}

/**
 * Ensures journal support is enabled for OpenCode agent memory while preserving any
 * user-managed settings and custom tags already present in the config file.
 *
 * @param homeDirectory Optional home directory override used by tests.
 * @returns Metadata describing whether the config file was created or updated.
 */
export const ensureAgentMemoryJournalConfig = async (
  homeDirectory = homedir()
): Promise<EnsureAgentMemoryJournalConfigResult> => {
  const configPath = resolveAgentMemoryConfigPath(homeDirectory)

  let existing: Record<string, unknown> = {}
  let created = false

  try {
    const source = await readFile(configPath, "utf8")
    existing = parseExistingConfig(source, configPath)
  } catch (error) {
    const fileError = error as NodeJS.ErrnoException
    if (fileError.code === "ENOENT") {
      created = true
    } else {
      throw error
    }
  }

  const existingJournalRaw = existing.journal
  const existingJournal =
    typeof existingJournalRaw === "object" && existingJournalRaw !== null
      ? { ...(existingJournalRaw as Record<string, unknown>) }
      : {}

  const nextJournal = {
    ...existingJournal,
    enabled: true,
    tags: mergeTags(existingJournal.tags),
  }

  const nextConfig: Record<string, unknown> = {
    ...existing,
    journal: nextJournal,
  }

  const previousSerialized = created ? "" : JSON.stringify(existing)
  const nextSerialized = JSON.stringify(nextConfig)
  const updated = created || previousSerialized !== nextSerialized

  if (updated) {
    await mkdir(path.dirname(configPath), { recursive: true })
    await writeFile(configPath, `${JSON.stringify(nextConfig, null, 2)}\n`, "utf8")
  }

  return {
    configPath,
    created,
    updated,
  }
}
