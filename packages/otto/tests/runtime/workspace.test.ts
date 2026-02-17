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
  it("copies workspace assets including .opencode tools", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)

    const assetDirectory = path.join(tempRoot, "assets")
    const ottoHome = path.join(tempRoot, "home")

    await mkdir(assetDirectory, { recursive: true })
    await mkdir(ottoHome, { recursive: true })

    await writeFile(path.join(assetDirectory, "opencode.jsonc"), '{\n  "foo": "bar"\n}\n', "utf8")
    await writeFile(path.join(assetDirectory, "AGENTS.md"), "# rules\n", "utf8")
    await mkdir(path.join(assetDirectory, ".opencode", "tools"), { recursive: true })
    await mkdir(path.join(assetDirectory, "task-config", "profiles"), { recursive: true })
    await writeFile(path.join(assetDirectory, ".opencode", "package.json"), "{}\n", "utf8")
    await writeFile(path.join(assetDirectory, "task-config", "base.jsonc"), "{}\n", "utf8")
    await writeFile(
      path.join(assetDirectory, "task-config", "profiles", "general-reminder.jsonc"),
      "{}\n",
      "utf8"
    )
    await writeFile(
      path.join(assetDirectory, ".opencode", "tools", "queue_telegram_message.ts"),
      "export default {}\n",
      "utf8"
    )

    // Act
    const deployed = await deployWorkspaceAssets(assetDirectory, ottoHome)

    // Assert
    expect(deployed).toEqual([
      path.join(ottoHome, "opencode.jsonc"),
      path.join(ottoHome, "AGENTS.md"),
      path.join(ottoHome, ".opencode"),
      path.join(ottoHome, "task-config"),
    ])

    await expect(readFile(path.join(ottoHome, "opencode.jsonc"), "utf8")).resolves.toContain("foo")
    await expect(readFile(path.join(ottoHome, "AGENTS.md"), "utf8")).resolves.toContain("rules")
    await expect(
      readFile(path.join(ottoHome, ".opencode", "tools", "queue_telegram_message.ts"), "utf8")
    ).resolves.toContain("export default")
    await expect(
      readFile(path.join(ottoHome, "task-config", "base.jsonc"), "utf8")
    ).resolves.toContain("{}")
  })
})
