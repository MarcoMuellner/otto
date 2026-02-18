import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"

import { createTranscriptionGateway } from "../../src/telegram-worker/transcription.js"

const TEMP_PREFIX = path.join(tmpdir(), "otto-transcription-")
const cleanupPaths: string[] = []

afterEach(async () => {
  vi.unstubAllGlobals()
  await Promise.all(
    cleanupPaths.splice(0).map(async (directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe("transcription gateway", () => {
  it("invokes command provider and parses stdout text", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const inputPath = path.join(tempRoot, "voice.ogg")
    await writeFile(inputPath, "voice")

    const gateway = createTranscriptionGateway({
      provider: "command",
      timeoutMs: 30_000,
      language: "en-US",
      model: "parakeet-v3",
      command: "node",
      commandArgs: ["-e", 'process.stdout.write("hello from command")'],
      baseUrl: "http://127.0.0.1:9000",
      httpPath: "/v1/audio/transcriptions",
    })

    // Act
    const result = await gateway.transcribe({
      audioFilePath: inputPath,
      mimeType: "audio/ogg",
      language: "en-US",
      model: "parakeet-v3",
      timeoutMs: 10_000,
    })

    // Assert
    expect(result).toEqual({ text: "hello from command", language: null })
  })

  it("supports HTTP provider response parsing", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const inputPath = path.join(tempRoot, "voice.ogg")
    await writeFile(inputPath, "voice")

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({ transcription: "hello from http", language: "en-US" }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          }
        )
      })
    )

    const gateway = createTranscriptionGateway({
      provider: "http",
      timeoutMs: 30_000,
      language: "en-US",
      model: "parakeet-v3",
      command: null,
      commandArgs: ["{input}"],
      baseUrl: "http://127.0.0.1:9000",
      httpPath: "/v1/audio/transcriptions",
    })

    // Act
    const result = await gateway.transcribe({
      audioFilePath: inputPath,
      mimeType: "audio/ogg",
      language: "en-US",
      model: "parakeet-v3",
      timeoutMs: 10_000,
    })

    // Assert
    expect(result).toEqual({ text: "hello from http", language: "en-US" })
  })
})
