import path from "node:path"
import { mkdir, readFile, writeFile } from "node:fs/promises"

import { listPromptFileInventory } from "./inventory.js"
import { resolvePromptRootDirectory } from "./layer-loader.js"
import type { PromptLayerSource } from "./routing-types.js"

type PromptFileAccessErrorCode = "invalid_path" | "not_found" | "forbidden_write"

export class PromptFileAccessError extends Error {
  code: PromptFileAccessErrorCode

  constructor(code: PromptFileAccessErrorCode, message: string) {
    super(message)
    this.name = "PromptFileAccessError"
    this.code = code
  }
}

export type PromptFileEntry = {
  source: PromptLayerSource
  relativePath: string
  editable: boolean
}

export type PromptFileReadResult = {
  source: PromptLayerSource
  relativePath: string
  editable: boolean
  content: string
}

export type PromptFileWriteResult = {
  source: "user"
  relativePath: string
  editable: true
  updatedAt: number
}

const PROMPT_MARKDOWN_EXTENSION = ".md"

const isSafeRelativePromptPath = (value: string): boolean => {
  const normalized = value.trim().replace(/\\/g, "/")
  if (normalized.length === 0) {
    return false
  }

  if (path.isAbsolute(normalized)) {
    return false
  }

  if (!normalized.toLowerCase().endsWith(PROMPT_MARKDOWN_EXTENSION)) {
    return false
  }

  const segments = normalized.split("/").filter((segment) => segment.length > 0)
  if (segments.length === 0 || segments.includes("..")) {
    return false
  }

  return true
}

const resolvePromptFilePath = (input: {
  ottoHome: string
  source: PromptLayerSource
  relativePath: string
}): { relativePath: string; absolutePath: string } => {
  const normalizedRelativePath = input.relativePath.trim().replace(/\\/g, "/")
  if (!isSafeRelativePromptPath(normalizedRelativePath)) {
    throw new PromptFileAccessError(
      "invalid_path",
      "Prompt file path must be a safe, relative .md path within prompt roots"
    )
  }

  const rootDirectory = resolvePromptRootDirectory(input.ottoHome, input.source)
  const resolvedAbsolutePath = path.resolve(rootDirectory, normalizedRelativePath)
  const rootPrefix = `${path.resolve(rootDirectory)}${path.sep}`

  if (!resolvedAbsolutePath.startsWith(rootPrefix)) {
    throw new PromptFileAccessError(
      "invalid_path",
      "Prompt file path must remain within prompt root directories"
    )
  }

  return {
    relativePath: normalizedRelativePath,
    absolutePath: resolvedAbsolutePath,
  }
}

/**
 * Lists prompt files with ownership-aware editability so management surfaces can show one
 * consolidated inventory while preserving system/user write boundaries.
 */
export const listManagedPromptFiles = async (input: {
  ottoHome: string
}): Promise<PromptFileEntry[]> => {
  const entries = await listPromptFileInventory({ ottoHome: input.ottoHome })
  return entries.map((entry) => ({
    source: entry.source,
    relativePath: entry.relativePath,
    editable: entry.source === "user",
  }))
}

/**
 * Reads one prompt file from either ownership root with strict path validation and stable
 * not-found errors for operator-facing APIs.
 */
export const readManagedPromptFile = async (input: {
  ottoHome: string
  source: PromptLayerSource
  relativePath: string
}): Promise<PromptFileReadResult> => {
  const resolved = resolvePromptFilePath(input)

  try {
    const content = await readFile(resolved.absolutePath, "utf8")
    return {
      source: input.source,
      relativePath: resolved.relativePath,
      editable: input.source === "user",
      content,
    }
  } catch (error) {
    const fileError = error as NodeJS.ErrnoException
    if (fileError.code === "ENOENT") {
      throw new PromptFileAccessError("not_found", "Prompt file not found")
    }

    throw error
  }
}

/**
 * Writes one user-owned prompt file with strict ownership/path checks so control surfaces can
 * safely update prompt customizations without touching system-managed prompt assets.
 */
export const writeManagedPromptFile = async (input: {
  ottoHome: string
  source: PromptLayerSource
  relativePath: string
  content: string
}): Promise<PromptFileWriteResult> => {
  if (input.source !== "user") {
    throw new PromptFileAccessError("forbidden_write", "Only user-owned prompt files can be edited")
  }

  const resolved = resolvePromptFilePath(input)
  await mkdir(path.dirname(resolved.absolutePath), { recursive: true })
  await writeFile(resolved.absolutePath, input.content, "utf8")

  return {
    source: "user",
    relativePath: resolved.relativePath,
    editable: true,
    updatedAt: Date.now(),
  }
}
