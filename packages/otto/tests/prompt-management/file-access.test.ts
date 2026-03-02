import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import { readManagedPromptFile, writeManagedPromptFile } from "../../src/prompt-management/index.js"

const TEMP_PREFIX = path.join(tmpdir(), "otto-prompt-file-access-")
const cleanupPaths: string[] = []

afterEach(async () => {
  await Promise.all(
    cleanupPaths.splice(0).map(async (directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe("managed prompt file access", () => {
  it("reads and writes user-owned prompt files", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    await mkdir(path.join(tempRoot, "prompts", "layers"), { recursive: true })
    await writeFile(path.join(tempRoot, "prompts", "layers", "media-web.md"), "# Initial\n", "utf8")

    // Act
    await writeManagedPromptFile({
      ottoHome: tempRoot,
      source: "user",
      relativePath: "layers/media-web.md",
      content: "# Updated\n",
    })
    const resolved = await readManagedPromptFile({
      ottoHome: tempRoot,
      source: "user",
      relativePath: "layers/media-web.md",
    })

    // Assert
    expect(resolved.content).toContain("Updated")
    const persisted = await readFile(
      path.join(tempRoot, "prompts", "layers", "media-web.md"),
      "utf8"
    )
    expect(persisted).toContain("Updated")
  })

  it("blocks writes to system-owned files", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)

    // Act + Assert
    await expect(
      writeManagedPromptFile({
        ottoHome: tempRoot,
        source: "system",
        relativePath: "layers/core-persona.md",
        content: "# Nope\n",
      })
    ).rejects.toMatchObject({
      code: "forbidden_write",
    })
  })

  it("blocks path traversal for writes", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)

    // Act + Assert
    await expect(
      writeManagedPromptFile({
        ottoHome: tempRoot,
        source: "user",
        relativePath: "../secrets/token.md",
        content: "bad",
      })
    ).rejects.toMatchObject({
      code: "invalid_path",
    })
  })
})
