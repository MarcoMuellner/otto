import { afterEach, describe, expect, it, vi } from "vitest"

import { downloadVoiceFile, validateVoicePayload } from "../../src/telegram-worker/voice-intake.js"

describe("voice intake", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("accepts payloads within configured limits", () => {
    // Arrange
    const payload = {
      fileId: "file-1",
      fileUniqueId: "unique-1",
      durationSec: 30,
      mimeType: "audio/ogg",
      fileSizeBytes: 2048,
    }

    // Act
    const result = validateVoicePayload(payload, {
      enabled: true,
      maxDurationSec: 60,
      maxBytes: 10_000,
      downloadTimeoutMs: 20_000,
    })

    // Assert
    expect(result).toEqual({ accepted: true })
  })

  it("rejects payloads that exceed configured size", () => {
    // Arrange
    const payload = {
      fileId: "file-1",
      fileUniqueId: "unique-1",
      durationSec: 30,
      mimeType: "audio/ogg",
      fileSizeBytes: 8_000,
    }

    // Act
    const result = validateVoicePayload(payload, {
      enabled: true,
      maxDurationSec: 60,
      maxBytes: 1_024,
      downloadTimeoutMs: 20_000,
    })

    // Assert
    expect(result).toEqual(
      expect.objectContaining({
        accepted: false,
        reason: "size_exceeded",
      })
    )
  })

  it("downloads voice data into temporary local file", async () => {
    // Arrange
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(Buffer.from("abc"), {
          status: 200,
          headers: {
            "content-length": "3",
          },
        })
      })
    )

    // Act
    const result = await downloadVoiceFile(
      {
        url: "https://example.test/voice.ogg",
        fileSizeBytes: 3,
      },
      {
        enabled: true,
        maxDurationSec: 60,
        maxBytes: 1_024,
        downloadTimeoutMs: 20_000,
      }
    )

    // Assert
    expect(result.bytes).toBe(3)

    await result.cleanup()
  })
})
