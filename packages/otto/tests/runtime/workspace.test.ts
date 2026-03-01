import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import {
  deployWorkspaceAssets,
  ensureWorkspaceDirectories,
  getWorkspaceDirectories,
  resolveAssetDirectory,
} from "../../src/runtime/workspace.js"

const TEMP_PREFIX = path.join(tmpdir(), "otto-workspace-")
const cleanupPaths: string[] = []

type SeedWorkspaceAssetInput = {
  systemPromptMarkdown?: string
  userPromptMarkdown?: string
  extraUserPromptFiles?: Array<{
    relativePath: string
    markdown: string
  }>
}

const seedWorkspaceAssets = async (
  assetDirectory: string,
  input: SeedWorkspaceAssetInput = {}
): Promise<void> => {
  const systemPromptMarkdown = input.systemPromptMarkdown ?? "# System prompt v1\n"
  const userPromptMarkdown = input.userPromptMarkdown ?? "# User prompt template v1\n"

  await mkdir(assetDirectory, { recursive: true })
  await mkdir(path.join(assetDirectory, ".opencode", "tools"), { recursive: true })
  await mkdir(path.join(assetDirectory, "task-config", "profiles"), { recursive: true })
  await mkdir(path.join(assetDirectory, "system-prompts", "layers"), { recursive: true })
  await mkdir(path.join(assetDirectory, "prompts", "layers"), { recursive: true })

  await writeFile(path.join(assetDirectory, "opencode.jsonc"), '{\n  "foo": "bar"\n}\n', "utf8")
  await writeFile(path.join(assetDirectory, "AGENTS.md"), "# rules\n", "utf8")
  await writeFile(path.join(assetDirectory, ".opencode", "package.json"), "{}\n", "utf8")
  await writeFile(
    path.join(assetDirectory, ".opencode", "tools", "queue_telegram_message.ts"),
    "export default {}\n",
    "utf8"
  )
  await writeFile(path.join(assetDirectory, "task-config", "base.jsonc"), "{}\n", "utf8")
  await writeFile(
    path.join(assetDirectory, "task-config", "profiles", "general-reminder.jsonc"),
    "{}\n",
    "utf8"
  )
  await writeFile(path.join(assetDirectory, "system-prompts", "mapping.jsonc"), "{}\n", "utf8")
  await writeFile(
    path.join(assetDirectory, "system-prompts", "layers", "core-persona.md"),
    systemPromptMarkdown,
    "utf8"
  )
  await writeFile(path.join(assetDirectory, "prompts", "mapping.jsonc"), "{}\n", "utf8")
  await writeFile(
    path.join(assetDirectory, "prompts", "layers", "core-persona.md"),
    userPromptMarkdown,
    "utf8"
  )

  for (const file of input.extraUserPromptFiles ?? []) {
    const targetPath = path.join(assetDirectory, "prompts", file.relativePath)
    await mkdir(path.dirname(targetPath), { recursive: true })
    await writeFile(targetPath, file.markdown, "utf8")
  }
}

afterEach(async () => {
  await Promise.all(
    cleanupPaths.splice(0).map(async (directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe("ensureWorkspaceDirectories", () => {
  it("creates otto home and required subdirectories", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)

    const ottoHome = path.join(tempRoot, ".otto")

    // Act
    const created = await ensureWorkspaceDirectories(ottoHome)

    // Assert
    expect(created).toContain(ottoHome)
    expect(created).toEqual([ottoHome, ...getWorkspaceDirectories(ottoHome)])
    expect(created).toContain(path.join(ottoHome, "extensions"))
    expect(created).toContain(path.join(ottoHome, "extensions", "store"))
    expect(created).toContain(path.join(ottoHome, "system-prompts"))
    expect(created).toContain(path.join(ottoHome, "prompts"))
  })
})

describe("resolveAssetDirectory", () => {
  it("resolves assets relative to runtime entrypoint", () => {
    // Arrange
    const runtimeEntryPath = "/opt/otto/dist/index.mjs"

    // Act
    const assetDirectory = resolveAssetDirectory(runtimeEntryPath)

    // Assert
    expect(assetDirectory).toBe("/opt/otto/dist/assets")
  })
})

describe("deployWorkspaceAssets", () => {
  it("copies workspace assets including prompt directories", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)

    const assetDirectory = path.join(tempRoot, "assets")
    const ottoHome = path.join(tempRoot, "home")

    await mkdir(ottoHome, { recursive: true })
    await seedWorkspaceAssets(assetDirectory)

    // Act
    const deployed = await deployWorkspaceAssets(assetDirectory, ottoHome)

    // Assert
    expect(deployed).toEqual([
      path.join(ottoHome, "opencode.jsonc"),
      path.join(ottoHome, "AGENTS.md"),
      path.join(ottoHome, ".opencode"),
      path.join(ottoHome, "task-config"),
      path.join(ottoHome, "system-prompts"),
      path.join(ottoHome, "prompts"),
    ])

    await expect(readFile(path.join(ottoHome, "opencode.jsonc"), "utf8")).resolves.toContain("foo")
    await expect(readFile(path.join(ottoHome, "AGENTS.md"), "utf8")).resolves.toContain("rules")
    await expect(
      readFile(path.join(ottoHome, ".opencode", "tools", "queue_telegram_message.ts"), "utf8")
    ).resolves.toContain("export default")
    await expect(
      readFile(path.join(ottoHome, "task-config", "base.jsonc"), "utf8")
    ).resolves.toContain("{}")
    await expect(
      readFile(path.join(ottoHome, "system-prompts", "layers", "core-persona.md"), "utf8")
    ).resolves.toContain("System prompt")
    await expect(
      readFile(path.join(ottoHome, "prompts", "layers", "core-persona.md"), "utf8")
    ).resolves.toContain("User prompt")
  })

  it("overwrites system prompts but preserves existing user prompts", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)

    const assetDirectory = path.join(tempRoot, "assets")
    const ottoHome = path.join(tempRoot, "home")

    await mkdir(ottoHome, { recursive: true })
    await seedWorkspaceAssets(assetDirectory, {
      systemPromptMarkdown: "# System prompt v1\n",
      userPromptMarkdown: "# User prompt template v1\n",
    })

    await deployWorkspaceAssets(assetDirectory, ottoHome)

    await writeFile(
      path.join(ottoHome, "system-prompts", "layers", "core-persona.md"),
      "# System prompt user edit\n",
      "utf8"
    )
    await writeFile(
      path.join(ottoHome, "prompts", "layers", "core-persona.md"),
      "# User prompt customized\n",
      "utf8"
    )

    await seedWorkspaceAssets(assetDirectory, {
      systemPromptMarkdown: "# System prompt v2\n",
      userPromptMarkdown: "# User prompt template v2\n",
    })

    // Act
    await deployWorkspaceAssets(assetDirectory, ottoHome)

    // Assert
    await expect(
      readFile(path.join(ottoHome, "system-prompts", "layers", "core-persona.md"), "utf8")
    ).resolves.toBe("# System prompt v2\n")
    await expect(
      readFile(path.join(ottoHome, "prompts", "layers", "core-persona.md"), "utf8")
    ).resolves.toBe("# User prompt customized\n")
  })

  it("seeds missing user prompt files while preserving existing ones", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)

    const assetDirectory = path.join(tempRoot, "assets")
    const ottoHome = path.join(tempRoot, "home")

    await mkdir(ottoHome, { recursive: true })
    await seedWorkspaceAssets(assetDirectory)

    await deployWorkspaceAssets(assetDirectory, ottoHome)
    await writeFile(
      path.join(ottoHome, "prompts", "layers", "core-persona.md"),
      "# User prompt customized\n",
      "utf8"
    )

    await seedWorkspaceAssets(assetDirectory, {
      extraUserPromptFiles: [
        {
          relativePath: "layers/surface-cli.md",
          markdown: "# CLI surface template\n",
        },
      ],
    })

    // Act
    await deployWorkspaceAssets(assetDirectory, ottoHome)

    // Assert
    await expect(
      readFile(path.join(ottoHome, "prompts", "layers", "core-persona.md"), "utf8")
    ).resolves.toBe("# User prompt customized\n")
    await expect(
      readFile(path.join(ottoHome, "prompts", "layers", "surface-cli.md"), "utf8")
    ).resolves.toBe("# CLI surface template\n")
  })
})
