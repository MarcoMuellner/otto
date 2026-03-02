import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import { listPromptFiles } from "../../src/prompt-management/index.js"

const TEMP_PREFIX = path.join(tmpdir(), "otto-prompt-file-inventory-")
const cleanupPaths: string[] = []

afterEach(async () => {
  await Promise.all(
    cleanupPaths.splice(0).map(async (directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe("listPromptFiles", () => {
  it("lists user and system markdown files with deterministic ownership ordering", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)

    await mkdir(path.join(tempRoot, "prompts", "layers"), { recursive: true })
    await mkdir(path.join(tempRoot, "system-prompts", "layers"), { recursive: true })

    await writeFile(path.join(tempRoot, "prompts", "layers", "core-persona.md"), "# user\n", "utf8")
    await writeFile(
      path.join(tempRoot, "system-prompts", "layers", "core-persona.md"),
      "# system\n",
      "utf8"
    )
    await writeFile(path.join(tempRoot, "system-prompts", "layers", "notes.txt"), "skip\n", "utf8")

    // Act
    const files = await listPromptFiles({ ottoHome: tempRoot })

    // Assert
    expect(files).toEqual([
      {
        source: "user",
        relativePath: "layers/core-persona.md",
        absolutePath: path.join(tempRoot, "prompts", "layers", "core-persona.md"),
      },
      {
        source: "system",
        relativePath: "layers/core-persona.md",
        absolutePath: path.join(tempRoot, "system-prompts", "layers", "core-persona.md"),
      },
    ])
  })
})
