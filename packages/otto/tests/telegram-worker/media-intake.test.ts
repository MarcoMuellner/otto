import { afterEach, describe, expect, it, vi } from "vitest"

import {
  buildMediaDataUrl,
  downloadInboundMediaFile,
  validateInboundMediaPayload,
} from "../../src/telegram-worker/media-intake.js"

describe("media intake", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("accepts supported document mime types", () => {
    // Arrange
    const payload = {
      mediaType: "document" as const,
      fileId: "file-1",
      fileUniqueId: "unique-1",
      mimeType: "application/pdf",
      fileSizeBytes: 2048,
      fileName: "report.pdf",
      caption: null,
    }

    // Act
    const result = validateInboundMediaPayload(payload, {
      maxBytes: 10_000,
      allowedMimeTypes: ["application/pdf"],
      downloadTimeoutMs: 20_000,
    })

    // Assert
    expect(result).toEqual({ accepted: true })
  })

  it("rejects unsupported mime types", () => {
    // Arrange
    const payload = {
      mediaType: "document" as const,
      fileId: "file-1",
      fileUniqueId: "unique-1",
      mimeType: "application/zip",
      fileSizeBytes: 2048,
      fileName: "archive.zip",
      caption: null,
    }

    // Act
    const result = validateInboundMediaPayload(payload, {
      maxBytes: 10_000,
      allowedMimeTypes: ["application/pdf"],
      downloadTimeoutMs: 20_000,
    })

    // Assert
    expect(result).toEqual(
      expect.objectContaining({
        accepted: false,
        reason: "unsupported_type",
      })
    )
  })

  it("downloads media and builds data url", async () => {
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
    const result = await downloadInboundMediaFile(
      {
        url: "https://example.test/report.pdf",
        fileSizeBytes: 3,
        fileName: "report.pdf",
      },
      {
        maxBytes: 1_024,
        downloadTimeoutMs: 20_000,
      }
    )

    const dataUrl = await buildMediaDataUrl(result.filePath, "application/pdf")

    // Assert
    expect(result.bytes).toBe(3)
    expect(dataUrl.startsWith("data:application/pdf;base64,")).toBe(true)

    await result.cleanup()
  })
})
