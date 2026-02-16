import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import {
  deployWorkspaceAssets,
  ensureWorkspaceDirectories,
  getWorkspaceDirectories,
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
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)

    const ottoHome = path.join(tempRoot, ".otto")
    const created = await ensureWorkspaceDirectories(ottoHome)

    expect(created).toContain(ottoHome)
    expect(created).toEqual([ottoHome, ...getWorkspaceDirectories(ottoHome)])
  })
})

describe("deployWorkspaceAssets", () => {
  it("copies opencode and AGENTS assets into otto home", async () => {
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)

    const assetDirectory = path.join(tempRoot, "assets")
    const ottoHome = path.join(tempRoot, "home")

    await mkdir(assetDirectory, { recursive: true })
    await mkdir(ottoHome, { recursive: true })

    await writeFile(path.join(assetDirectory, "opencode.jsonc"), '{\n  "foo": "bar"\n}\n', "utf8")
    await writeFile(path.join(assetDirectory, "AGENTS.md"), "# rules\n", "utf8")

    const deployed = await deployWorkspaceAssets(assetDirectory, ottoHome)

    expect(deployed).toEqual([
      path.join(ottoHome, "opencode.jsonc"),
      path.join(ottoHome, "AGENTS.md"),
    ])

    await expect(readFile(path.join(ottoHome, "opencode.jsonc"), "utf8")).resolves.toContain("foo")
    await expect(readFile(path.join(ottoHome, "AGENTS.md"), "utf8")).resolves.toContain("rules")
  })
})
