import { createWriteStream } from "node:fs"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { Readable, Transform } from "node:stream"
import { pipeline } from "node:stream/promises"

export type TelegramInboundMediaType = "document" | "photo"

export type TelegramInboundMediaMessage = {
  mediaType: TelegramInboundMediaType
  fileId: string
  fileUniqueId: string | null
  mediaGroupId: string | null
  mimeType: string
  fileSizeBytes: number | null
  fileName: string | null
  caption: string | null
}

export type TelegramMediaDownloadDescriptor = {
  url: string
  fileSizeBytes: number | null
  fileName: string | null
}

export type MediaIntakeConfig = {
  maxBytes: number
  allowedMimeTypes: string[]
  downloadTimeoutMs: number
}

export type MediaDownloadConfig = {
  maxBytes: number
  downloadTimeoutMs: number
}

export type MediaDownloadResult = {
  filePath: string
  bytes: number
  cleanup: () => Promise<void>
}

export type MediaValidationResult =
  | { accepted: true }
  | {
      accepted: false
      reason: "invalid_payload" | "size_exceeded" | "unsupported_type"
      message: string
    }

const normalizeMimeType = (mimeType: string): string => {
  const trimmed = mimeType.trim().toLowerCase()
  return trimmed.length > 0 ? trimmed : "application/octet-stream"
}

const isAllowedMimeType = (mimeType: string, allowedMimeTypes: string[]): boolean => {
  return allowedMimeTypes.some((allowed) => {
    if (allowed.endsWith("/*")) {
      const prefix = allowed.slice(0, -1)
      return mimeType.startsWith(prefix)
    }

    return mimeType === allowed
  })
}

/**
 * Validates inbound Telegram document/photo metadata before download so unsafe or unsupported
 * media is rejected early and resource usage stays bounded.
 */
export const validateInboundMediaPayload = (
  media: TelegramInboundMediaMessage,
  config: MediaIntakeConfig
): MediaValidationResult => {
  if (!media.fileId) {
    return {
      accepted: false,
      reason: "invalid_payload",
      message: "I could not read that media metadata. Please try sending it again.",
    }
  }

  if (media.fileSizeBytes != null && media.fileSizeBytes > config.maxBytes) {
    return {
      accepted: false,
      reason: "size_exceeded",
      message: `That file is too large. Please keep it under ${Math.floor(config.maxBytes / (1024 * 1024))} MB.`,
    }
  }

  const normalizedMimeType = normalizeMimeType(media.mimeType)
  if (!isAllowedMimeType(normalizedMimeType, config.allowedMimeTypes)) {
    return {
      accepted: false,
      reason: "unsupported_type",
      message:
        "I cannot process this file type yet. Please send a PDF, text, CSV, JSON, or common image format.",
    }
  }

  return { accepted: true }
}

/**
 * Downloads a Telegram media file to an isolated temporary path with strict transfer limits.
 */
export const downloadInboundMediaFile = async (
  descriptor: TelegramMediaDownloadDescriptor,
  config: MediaDownloadConfig
): Promise<MediaDownloadResult> => {
  const tempDirectory = await mkdtemp(path.join(tmpdir(), "otto-media-"))
  const safeFileName = descriptor.fileName?.replaceAll(/[^a-zA-Z0-9._-]/g, "_") || "media.bin"
  const filePath = path.join(tempDirectory, safeFileName)

  const cleanup = async (): Promise<void> => {
    await rm(tempDirectory, { recursive: true, force: true })
  }

  const response = await fetch(descriptor.url, {
    signal: AbortSignal.timeout(config.downloadTimeoutMs),
  })

  if (!response.ok) {
    await cleanup()
    throw new Error(`Media download failed (${response.status})`)
  }

  const contentLengthHeader = response.headers.get("content-length")
  const contentLength = contentLengthHeader ? Number(contentLengthHeader) : null
  if (contentLength != null && Number.isInteger(contentLength) && contentLength > config.maxBytes) {
    await cleanup()
    throw new Error("Media download exceeds size limit before transfer")
  }

  if (!response.body) {
    await cleanup()
    throw new Error("Media download response body is empty")
  }

  let bytes = 0
  const limiter = new Transform({
    transform(chunk, _encoding, callback) {
      const piece = chunk as Buffer
      bytes += piece.length
      if (bytes > config.maxBytes) {
        callback(new Error("Media download exceeded configured byte limit"))
        return
      }

      callback(null, piece)
    },
  })

  try {
    await pipeline(Readable.fromWeb(response.body), limiter, createWriteStream(filePath))
  } catch (error) {
    await cleanup()
    throw error
  }

  return {
    filePath,
    bytes,
    cleanup,
  }
}

/**
 * Encodes downloaded media as a data URL so OpenCode can consume it directly without external
 * file hosting or token-bearing Telegram URLs.
 */
export const buildMediaDataUrl = async (filePath: string, mimeType: string): Promise<string> => {
  const data = await readFile(filePath)
  return `data:${normalizeMimeType(mimeType)};base64,${data.toString("base64")}`
}
