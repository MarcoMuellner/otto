import { mkdir, readFile, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"

import { tool } from "@opencode-ai/plugin"

type JournalTag = {
  name: string
  description: string
}

const resolveConfigPath = (): string => {
  return path.join(homedir(), ".config", "opencode", "agent-memory.json")
}

const normalizeTag = (input: JournalTag): JournalTag => {
  return {
    name: input.name.trim(),
    description: input.description.trim(),
  }
}

const mergeTags = (existing: JournalTag[], incoming: JournalTag[]): JournalTag[] => {
  const byName = new Map<string, JournalTag>()

  for (const tag of existing) {
    byName.set(tag.name.toLowerCase(), tag)
  }

  for (const tag of incoming) {
    byName.set(tag.name.toLowerCase(), tag)
  }

  return Array.from(byName.values())
}

export default tool({
  description:
    "Set OpenCode journal tags in ~/.config/opencode/agent-memory.json. Defaults to merge mode and keeps unrelated config keys.",
  args: {
    tags: tool.schema
      .array(
        tool.schema.object({
          name: tool.schema.string().trim().min(1),
          description: tool.schema.string().trim().min(1),
        })
      )
      .min(1)
      .describe("Journal tags to merge or replace"),
    mode: tool.schema
      .enum(["merge", "replace"])
      .optional()
      .describe("merge adds/updates by tag name; replace overwrites full tag list"),
    enabled: tool.schema.boolean().optional().describe("Optional journal enabled flag override"),
  },
  async execute(args): Promise<string> {
    const configPath = resolveConfigPath()
    const mode = args.mode ?? "merge"

    let config: Record<string, unknown> = {}
    try {
      const source = await readFile(configPath, "utf8")
      const parsed = JSON.parse(source)

      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error(`Config at ${configPath} must be a JSON object`)
      }

      config = { ...(parsed as Record<string, unknown>) }
    } catch (error) {
      const fileError = error as NodeJS.ErrnoException
      if (fileError.code !== "ENOENT") {
        throw error
      }
    }

    const rawJournal = config.journal
    const journal =
      typeof rawJournal === "object" && rawJournal !== null && !Array.isArray(rawJournal)
        ? { ...(rawJournal as Record<string, unknown>) }
        : {}

    const incoming = args.tags.map(normalizeTag)

    const existing = Array.isArray(journal.tags)
      ? (journal.tags as unknown[])
          .filter((value): value is JournalTag => {
            if (typeof value !== "object" || value === null || Array.isArray(value)) {
              return false
            }

            const name = (value as { name?: unknown }).name
            const description = (value as { description?: unknown }).description

            return (
              typeof name === "string" &&
              name.trim().length > 0 &&
              typeof description === "string" &&
              description.trim().length > 0
            )
          })
          .map(normalizeTag)
      : []

    journal.tags = mode === "replace" ? incoming : mergeTags(existing, incoming)
    const existingEnabled = typeof journal.enabled === "boolean" ? journal.enabled : true
    journal.enabled = args.enabled ?? existingEnabled
    config.journal = journal

    await mkdir(path.dirname(configPath), { recursive: true })
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8")

    return JSON.stringify({
      configPath,
      mode,
      enabled: journal.enabled,
      tagCount: Array.isArray(journal.tags) ? journal.tags.length : 0,
      tags: journal.tags,
    })
  },
})
