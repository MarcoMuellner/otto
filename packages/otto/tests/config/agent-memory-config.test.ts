import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import {
  ensureAgentMemoryJournalConfig,
  resolveAgentMemoryConfigPath,
} from "../../src/config/agent-memory-config.js"

const TEMP_PREFIX = path.join(tmpdir(), "otto-agent-memory-")
const cleanupPaths: string[] = []

afterEach(async () => {
  await Promise.all(
    cleanupPaths.splice(0).map(async (directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe("resolveAgentMemoryConfigPath", () => {
  it("resolves under ~/.config/opencode", () => {
    const configPath = resolveAgentMemoryConfigPath("/tmp/test-home")

    expect(configPath).toBe("/tmp/test-home/.config/opencode/agent-memory.json")
  })
})

describe("ensureAgentMemoryJournalConfig", () => {
  it("creates config with journal enabled and default tags when missing", async () => {
    const homeDirectory = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(homeDirectory)

    const result = await ensureAgentMemoryJournalConfig(homeDirectory)
    const saved = JSON.parse(await readFile(result.configPath, "utf8")) as {
      journal?: {
        enabled?: boolean
        tags?: Array<{ name: string; description: string }>
      }
    }

    expect(result.created).toBe(true)
    expect(result.updated).toBe(true)
    expect(saved.journal?.enabled).toBe(true)
    expect(saved.journal?.tags?.length).toBeGreaterThanOrEqual(6)
    expect(saved.journal?.tags?.some((tag) => tag.name === "priorities")).toBe(true)
  })

  it("merges onto existing config without removing unrelated keys or custom tags", async () => {
    const homeDirectory = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(homeDirectory)

    const configPath = resolveAgentMemoryConfigPath(homeDirectory)
    await mkdir(path.dirname(configPath), { recursive: true })
    await writeFile(
      configPath,
      `${JSON.stringify(
        {
          custom: {
            keep: true,
          },
          journal: {
            enabled: false,
            tags: [{ name: "ops", description: "Custom operator tag" }],
          },
        },
        null,
        2
      )}\n`,
      "utf8"
    )

    const result = await ensureAgentMemoryJournalConfig(homeDirectory)
    const saved = JSON.parse(await readFile(configPath, "utf8")) as {
      custom?: {
        keep?: boolean
      }
      journal?: {
        enabled?: boolean
        tags?: Array<{ name: string; description: string }>
      }
    }

    expect(result.created).toBe(false)
    expect(result.updated).toBe(true)
    expect(saved.custom?.keep).toBe(true)
    expect(saved.journal?.enabled).toBe(true)
    expect(saved.journal?.tags?.some((tag) => tag.name === "ops")).toBe(true)
    expect(saved.journal?.tags?.some((tag) => tag.name === "follow-ups")).toBe(true)
  })
})
