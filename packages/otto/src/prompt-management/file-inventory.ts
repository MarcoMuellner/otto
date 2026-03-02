import path from "node:path"
import { readdir } from "node:fs/promises"

import { resolvePromptRootDirectory } from "./layer-loader.js"
import type { PromptLayerSource } from "./routing-types.js"

export type PromptFileEntry = {
  source: PromptLayerSource
  relativePath: string
  absolutePath: string
}

const walkMarkdownFiles = async (input: {
  rootDirectory: string
  currentDirectory: string
}): Promise<PromptFileEntry["relativePath"][]> => {
  const entries = await readdir(input.currentDirectory, { withFileTypes: true }).catch((error) => {
    const fileError = error as NodeJS.ErrnoException
    if (fileError.code === "ENOENT") {
      return []
    }

    throw error
  })

  const markdownFiles: string[] = []

  for (const entry of entries) {
    const absolutePath = path.join(input.currentDirectory, entry.name)

    if (entry.isDirectory()) {
      const childFiles = await walkMarkdownFiles({
        rootDirectory: input.rootDirectory,
        currentDirectory: absolutePath,
      })
      markdownFiles.push(...childFiles)
      continue
    }

    if (!entry.isFile() || !entry.name.endsWith(".md")) {
      continue
    }

    markdownFiles.push(path.relative(input.rootDirectory, absolutePath).replaceAll("\\", "/"))
  }

  return markdownFiles
}

/**
 * Lists user/system prompt markdown files from their ownership roots so CLI and web surfaces
 * can render one explicit inventory without re-encoding workspace path conventions.
 */
export const listPromptFiles = async (input: { ottoHome: string }): Promise<PromptFileEntry[]> => {
  const sourceOrder: PromptLayerSource[] = ["user", "system"]
  const entries: PromptFileEntry[] = []

  for (const source of sourceOrder) {
    const rootDirectory = resolvePromptRootDirectory(input.ottoHome, source)
    const relativePaths = await walkMarkdownFiles({
      rootDirectory,
      currentDirectory: rootDirectory,
    })

    for (const relativePath of relativePaths) {
      entries.push({
        source,
        relativePath,
        absolutePath: path.join(rootDirectory, relativePath),
      })
    }
  }

  entries.sort((left, right) => {
    if (left.source !== right.source) {
      return left.source === "user" ? -1 : 1
    }

    return left.relativePath.localeCompare(right.relativePath)
  })

  return entries
}
