import path from "node:path"
import { readFile } from "node:fs/promises"

import type { PromptLayerReference, PromptLayerSource } from "./routing-types.js"
import type { PromptLayerInput } from "./types.js"

const SYSTEM_PROMPTS_DIRECTORY_NAME = "system-prompts"
const USER_PROMPTS_DIRECTORY_NAME = "prompts"

export type PromptLayerContribution = {
  source: PromptLayerSource
  path: string
  absolutePath: string
  input: PromptLayerInput
}

export type AdditivePromptLayerLoadResult = {
  input: PromptLayerInput
  contributions: PromptLayerContribution[]
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

const loadPromptLayerInputFromRelativePath = async (input: {
  ottoHome: string
  source: PromptLayerSource
  relativePath: string
}): Promise<PromptLayerContribution> => {
  const rootDirectory = resolvePromptRootDirectory(input.ottoHome, input.source)
  const absolutePath = path.join(rootDirectory, input.relativePath)

  return {
    source: input.source,
    path: input.relativePath,
    input: await loadPromptLayerInputFromAbsolutePath(absolutePath),
    absolutePath,
  }
}

/**
 * Loads one prompt layer from both system and user roots and appends their markdown in fixed
 * order (system first, then user) when content is available.
 *
 * @param input Otto home and relative path shared across system/user prompt roots.
 * @returns Combined layer input and contributor-level diagnostics.
 */
export const loadAdditivePromptLayerFromRelativePath = async (input: {
  ottoHome: string
  relativePath: string
}): Promise<AdditivePromptLayerLoadResult> => {
  const [system, user] = await Promise.all([
    loadPromptLayerInputFromRelativePath({
      ottoHome: input.ottoHome,
      source: "system",
      relativePath: input.relativePath,
    }),
    loadPromptLayerInputFromRelativePath({
      ottoHome: input.ottoHome,
      source: "user",
      relativePath: input.relativePath,
    }),
  ])

  const contributions: PromptLayerContribution[] = [system, user]

  const resolvedSegments = contributions
    .filter((contribution) => contribution.input.status === "resolved")
    .map((contribution) => {
      const resolvedInput = contribution.input
      if (resolvedInput.status !== "resolved") {
        return ""
      }

      return resolvedInput.markdown
    })
    .filter((markdown) => markdown.trim().length > 0)

  if (resolvedSegments.length > 0) {
    return {
      input: {
        status: "resolved",
        markdown: resolvedSegments.join("\n\n"),
      },
      contributions,
    }
  }

  const invalidReasons = contributions
    .filter((contribution) => contribution.input.status === "invalid")
    .map((contribution) => {
      const invalidInput = contribution.input
      if (invalidInput.status !== "invalid") {
        return ""
      }

      return `${contribution.source}:${invalidInput.reason}`
    })
    .filter((reason) => reason.length > 0)

  if (invalidReasons.length > 0) {
    return {
      input: {
        status: "invalid",
        reason: invalidReasons.join("; "),
      },
      contributions,
    }
  }

  return {
    input: {
      status: "missing",
    },
    contributions,
  }
}

/**
 * Loads one route-backed prompt layer additively by relative path from system and user roots.
 * Route source selection is ignored so user files always append deterministically.
 *
 * @param input Otto home and prompt layer reference from route mapping.
 * @returns Combined layer input and contributor-level diagnostics.
 */
export const loadAdditivePromptLayerFromReference = async (input: {
  ottoHome: string
  reference: PromptLayerReference
}): Promise<AdditivePromptLayerLoadResult> => {
  return loadAdditivePromptLayerFromRelativePath({
    ottoHome: input.ottoHome,
    relativePath: input.reference.path,
  })
}
