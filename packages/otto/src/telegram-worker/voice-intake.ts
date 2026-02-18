import { mkdtemp, rm } from "node:fs/promises"
import { createWriteStream } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { Readable, Transform } from "node:stream"
import { pipeline } from "node:stream/promises"

import type { TelegramVoiceConfig } from "./config.js"

export type TelegramVoiceMessage = {
  fileId: string
  fileUniqueId: string | null
  durationSec: number
  mimeType: string
  fileSizeBytes: number | null
}

export type TelegramVoiceDownloadDescriptor = {
  url: string
  fileSizeBytes: number | null
  fileName: string | null
}

export type VoiceDownloadResult = {
  filePath: string
  bytes: number
  cleanup: () => Promise<void>
}

export type VoiceRejectionReason = "duration_exceeded" | "size_exceeded" | "invalid_voice_payload"

export type VoiceValidationResult =
  | { accepted: true }
  | {
      accepted: false
      reason: VoiceRejectionReason
      message: string
    }

/**
 * Validates voice metadata using strict guardrails so costly download/transcription work is
 * rejected early and operational abuse remains bounded.
 *
 * @param voice Voice metadata extracted from Telegram update.
 * @param config Voice intake limits.
 * @returns Accepted state or a user-facing rejection reason.
 */
export const validateVoicePayload = (
  voice: TelegramVoiceMessage,
  config: TelegramVoiceConfig
): VoiceValidationResult => {
  if (!voice.fileId || voice.durationSec < 1) {
    return {
      accepted: false,
      reason: "invalid_voice_payload",
      message: "I could not read that voice message metadata. Please try again.",
    }
  }

  if (voice.durationSec > config.maxDurationSec) {
    return {
      accepted: false,
      reason: "duration_exceeded",
      message: `That voice message is too long. Please keep it under ${config.maxDurationSec} seconds.`,
    }
  }

  if (voice.fileSizeBytes != null && voice.fileSizeBytes > config.maxBytes) {
    return {
      accepted: false,
      reason: "size_exceeded",
      message: `That voice message is too large. Please keep it under ${Math.floor(config.maxBytes / (1024 * 1024))} MB.`,
    }
  }

  return { accepted: true }
}

/**
 * Downloads voice media into an isolated temporary directory with strict byte/time limits so
 * transcription inputs remain local, bounded, and safe to clean up.
 *
 * @param descriptor Resolved Telegram file download descriptor.
 * @param config Voice intake limits.
 * @returns Local file path, byte count, and cleanup callback.
 */
export const downloadVoiceFile = async (
  descriptor: TelegramVoiceDownloadDescriptor,
  config: TelegramVoiceConfig
): Promise<VoiceDownloadResult> => {
  const tempDirectory = await mkdtemp(path.join(tmpdir(), "otto-voice-"))
  const safeFileName = descriptor.fileName?.replaceAll(/[^a-zA-Z0-9._-]/g, "_") || "voice.bin"
  const filePath = path.join(tempDirectory, safeFileName)

  const cleanup = async (): Promise<void> => {
    await rm(tempDirectory, { recursive: true, force: true })
  }

  const response = await fetch(descriptor.url, {
    signal: AbortSignal.timeout(config.downloadTimeoutMs),
  })

  if (!response.ok) {
    await cleanup()
    throw new Error(`Voice download failed (${response.status})`)
  }

  const contentLengthHeader = response.headers.get("content-length")
  const contentLength = contentLengthHeader ? Number(contentLengthHeader) : null
  if (contentLength != null && Number.isInteger(contentLength) && contentLength > config.maxBytes) {
    await cleanup()
    throw new Error("Voice download exceeds size limit before transfer")
  }

  if (!response.body) {
    await cleanup()
    throw new Error("Voice download response body is empty")
  }

  let bytes = 0

  const limiter = new Transform({
    transform(chunk, _encoding, callback) {
      const piece = chunk as Buffer
      bytes += piece.length
      if (bytes > config.maxBytes) {
        callback(new Error("Voice download exceeded configured byte limit"))
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
