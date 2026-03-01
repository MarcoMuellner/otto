import path from "node:path"
import { readFile } from "node:fs/promises"

import type { PromptLayerReference, PromptLayerSource } from "./routing-types.js"
import type { PromptLayerInput } from "./types.js"

const SYSTEM_PROMPTS_DIRECTORY_NAME = "system-prompts"
const USER_PROMPTS_DIRECTORY_NAME = "prompts"

export type PromptLayerLoadResult = {
  input: PromptLayerInput
  absolutePath: string
}

/**
 * Resolves the root directory for one prompt layer source so mapping references can be read
 * through stable workspace-owned roots.
 *
 * @param ottoHome Otto workspace root.
 * @param source Prompt layer source (`system` or `user`).
 * @returns Absolute prompt root directory.
 */
export const resolvePromptRootDirectory = (ottoHome: string, source: PromptLayerSource): string => {
  return path.join(
    ottoHome,
    source === "system" ? SYSTEM_PROMPTS_DIRECTORY_NAME : USER_PROMPTS_DIRECTORY_NAME
  )
}

const loadPromptLayerInputFromAbsolutePath = async (
  absolutePath: string
): Promise<PromptLayerInput> => {
  try {
    const markdown = await readFile(absolutePath, "utf8")

    return {
      status: "resolved",
      markdown,
    }
  } catch (error) {
    const fileError = error as NodeJS.ErrnoException
    if (fileError.code === "ENOENT") {
      return {
        status: "missing",
      }
    }

    const errorMessage = error instanceof Error ? error.message : String(error)

    return {
      status: "invalid",
      reason: `Unable to read prompt layer file at '${absolutePath}': ${errorMessage}`,
    }
  }
}

/**
 * Loads one route-backed prompt layer and preserves the absolute path for structured diagnostics.
 *
 * @param input Otto home and prompt layer reference from route mapping.
 * @returns Layer input status plus absolute file path.
 */
export const loadPromptLayerInputFromReference = async (input: {
  ottoHome: string
  reference: PromptLayerReference
}): Promise<PromptLayerLoadResult> => {
  const rootDirectory = resolvePromptRootDirectory(input.ottoHome, input.reference.source)
  const absolutePath = path.join(rootDirectory, input.reference.path)

  return {
    input: await loadPromptLayerInputFromAbsolutePath(absolutePath),
    absolutePath,
  }
}

/**
 * Loads one prompt layer from an explicit source-relative path so job-specific profile prompts
 * can reuse the same file-read semantics as mapped route layers.
 *
 * @param input Otto home, prompt source, and relative path within that source root.
 * @returns Layer input status plus absolute file path.
 */
export const loadPromptLayerInputFromRelativePath = async (input: {
  ottoHome: string
  source: PromptLayerSource
  relativePath: string
}): Promise<PromptLayerLoadResult> => {
  const rootDirectory = resolvePromptRootDirectory(input.ottoHome, input.source)
  const absolutePath = path.join(rootDirectory, input.relativePath)

  return {
    input: await loadPromptLayerInputFromAbsolutePath(absolutePath),
    absolutePath,
  }
}
