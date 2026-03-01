import path from "node:path"
import { readdir } from "node:fs/promises"

import { PROMPT_LAYER_SOURCE_VALUES, type PromptLayerSource } from "./routing-types.js"
import { resolvePromptRootDirectory } from "./layer-loader.js"

export type PromptFileInventoryEntry = {
  source: PromptLayerSource
  relativePath: string
  absolutePath: string
}

const PROMPT_MARKDOWN_EXTENSION = ".md"

const toPosixPath = (value: string): string => {
  return value.replaceAll(path.sep, "/")
}

const collectMarkdownFilesRecursively = async (
  rootDirectory: string,
  currentDirectory = rootDirectory
): Promise<string[]> => {
  let entries
  try {
    entries = await readdir(currentDirectory, { withFileTypes: true })
  } catch (error) {
    const fileError = error as NodeJS.ErrnoException
    if (fileError.code === "ENOENT") {
      return []
    }

    throw error
  }

  const discovered: string[] = []

  for (const entry of entries) {
    const absolutePath = path.join(currentDirectory, entry.name)

    if (entry.isDirectory()) {
      discovered.push(...(await collectMarkdownFilesRecursively(rootDirectory, absolutePath)))
      continue
    }

    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== PROMPT_MARKDOWN_EXTENSION) {
      continue
    }

    discovered.push(toPosixPath(path.relative(rootDirectory, absolutePath)))
  }

  return discovered
}

/**
 * Lists prompt markdown files from both prompt ownership roots so operator tooling can present one
 * deterministic inventory while preserving source ownership context.
 *
 * @param input Otto workspace root where prompt ownership roots live.
 * @returns Sorted prompt file inventory entries across system and user roots.
 */
export const listPromptFileInventory = async (input: {
  ottoHome: string
}): Promise<PromptFileInventoryEntry[]> => {
  const entries: PromptFileInventoryEntry[] = []

  for (const source of PROMPT_LAYER_SOURCE_VALUES) {
    const rootDirectory = resolvePromptRootDirectory(input.ottoHome, source)
    const relativeFiles = await collectMarkdownFilesRecursively(rootDirectory)

    for (const relativePath of relativeFiles) {
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
