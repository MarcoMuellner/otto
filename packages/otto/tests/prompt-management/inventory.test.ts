import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import { listPromptFileInventory } from "../../src/prompt-management/index.js"

const TEMP_PREFIX = path.join(tmpdir(), "otto-prompt-inventory-")
const cleanupPaths: string[] = []

afterEach(async () => {
  await Promise.all(
    cleanupPaths.splice(0).map(async (directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe("listPromptFileInventory", () => {
  it("lists markdown files from user and system roots with ownership labels", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)

    await mkdir(path.join(tempRoot, "system-prompts", "layers"), { recursive: true })
    await mkdir(path.join(tempRoot, "prompts", "layers"), { recursive: true })
    await writeFile(
      path.join(tempRoot, "system-prompts", "layers", "core-persona.md"),
      "# System\n",
      "utf8"
    )
    await writeFile(path.join(tempRoot, "prompts", "layers", "media-cli.md"), "# User\n", "utf8")
    await writeFile(path.join(tempRoot, "prompts", "mapping.jsonc"), "{}\n", "utf8")

    // Act
    const inventory = await listPromptFileInventory({ ottoHome: tempRoot })

    // Assert
    expect(inventory).toEqual([
      {
        source: "user",
        relativePath: "layers/media-cli.md",
        absolutePath: path.join(tempRoot, "prompts", "layers", "media-cli.md"),
      },
      {
        source: "system",
        relativePath: "layers/core-persona.md",
        absolutePath: path.join(tempRoot, "system-prompts", "layers", "core-persona.md"),
      },
    ])
  })

  it("treats missing prompt roots as empty inventory sources", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)

    await mkdir(path.join(tempRoot, "prompts", "layers"), { recursive: true })
    await writeFile(path.join(tempRoot, "prompts", "layers", "media-cli.md"), "# User\n", "utf8")

    // Act
    const inventory = await listPromptFileInventory({ ottoHome: tempRoot })

    // Assert
    expect(inventory).toEqual([
      {
        source: "user",
        relativePath: "layers/media-cli.md",
        absolutePath: path.join(tempRoot, "prompts", "layers", "media-cli.md"),
      },
    ])
  })
})
