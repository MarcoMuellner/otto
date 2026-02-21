import path from "node:path"
import { access, copyFile, mkdir, realpath, stat } from "node:fs/promises"
import { constants } from "node:fs"
import { randomUUID } from "node:crypto"

export type StageOutboundFileInput = {
  requestedPath: string
  ottoHome: string
  maxBytes: number
}

export type StagedOutboundFile = {
  stagedPath: string
  sourcePath: string
  fileName: string
  bytes: number
}

const resolvePathWithinOttoHome = async (
  requestedPath: string,
  ottoHome: string
): Promise<string> => {
  const resolvedOttoHome = path.resolve(ottoHome)
  const resolvedPath = path.isAbsolute(requestedPath)
    ? path.resolve(requestedPath)
    : path.resolve(resolvedOttoHome, requestedPath)

  const canonicalOttoHome = await realpath(resolvedOttoHome)
  const canonicalPath = await realpath(resolvedPath)

  const relative = path.relative(canonicalOttoHome, canonicalPath)
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("file_path_outside_otto_home")
  }

  return canonicalPath
}

/**
 * Copies an outbound file into an Otto-managed staging directory so queued retries remain
 * stable even if the original source path changes after enqueue.
 */
export const stageOutboundTelegramFile = async (
  input: StageOutboundFileInput
): Promise<StagedOutboundFile> => {
  const sourcePath = await resolvePathWithinOttoHome(input.requestedPath, input.ottoHome)
  await access(sourcePath, constants.R_OK)

  const sourceStats = await stat(sourcePath)
  if (!sourceStats.isFile()) {
    throw new Error("file_path_not_a_file")
  }

  if (sourceStats.size > input.maxBytes) {
    throw new Error("file_size_exceeded")
  }

  const fileName = path.basename(sourcePath)
  const extension = path.extname(fileName)
  const stageDirectory = path.join(input.ottoHome, "data", "telegram-outbox")
  await mkdir(stageDirectory, { recursive: true })

  const stagedPath = path.join(stageDirectory, `${randomUUID()}${extension}`)
  await copyFile(sourcePath, stagedPath)

  return {
    stagedPath,
    sourcePath,
    fileName,
    bytes: sourceStats.size,
  }
}
