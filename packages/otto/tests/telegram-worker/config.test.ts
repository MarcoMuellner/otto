import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import {
  loadTelegramCredentials,
  resolveTelegramWorkerConfig,
  resolveTelegramSecretsFilePath,
} from "../../src/telegram-worker/config.js"

const TEMP_PREFIX = path.join(tmpdir(), "otto-telegram-config-")
const cleanupPaths: string[] = []

const defaultSettings = {
  promptTimeoutMs: 300_000,
  voice: {
    enabled: false,
    maxDurationSec: 180,
    maxBytes: 10 * 1024 * 1024,
    downloadTimeoutMs: 20_000,
  },
  transcription: {
    provider: "command" as const,
    timeoutMs: 300_000,
    workerStartupTimeoutMs: 600_000,
    language: "auto",
    model: "small",
    command: null,
    commandArgs: ["{input}"],
    workerScriptPath: null,
    workerPythonPath: null,
    baseUrl: "http://127.0.0.1:9000",
    httpPath: "/v1/audio/transcriptions",
  },
}

afterEach(async () => {
  await Promise.all(
    cleanupPaths.splice(0).map(async (directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe("loadTelegramCredentials", () => {
  it("loads bot token and allowlisted user from secrets file", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const secretsPath = path.join(tempRoot, "telegram.env")
    await writeFile(secretsPath, "TELEGRAM_BOT_TOKEN=abc\nTELEGRAM_ALLOWED_USER_ID=123\n", "utf8")

    // Act
    const credentials = loadTelegramCredentials(secretsPath)

    // Assert
    expect(credentials).toEqual({
      botToken: "abc",
      allowedUserId: 123,
    })
  })

  it("returns null credentials when file is missing", () => {
    // Arrange
    const secretsPath = path.join(tmpdir(), "missing-telegram.env")

    // Act
    const credentials = loadTelegramCredentials(secretsPath)

    // Assert
    expect(credentials).toEqual({
      botToken: null,
      allowedUserId: null,
    })
  })

  it("resolves default secrets location under user home", () => {
    // Arrange
    const home = "/tmp/test-home"

    // Act
    const resolved = resolveTelegramSecretsFilePath(home)

    // Assert
    expect(resolved).toBe("/tmp/test-home/.local/share/otto/secrets/telegram.env")
  })
})

describe("resolveTelegramWorkerConfig", () => {
  it("resolves worker config from settings and credentials", () => {
    // Arrange
    const credentials = {
      botToken: "bot-token",
      allowedUserId: 1001,
    }

    // Act
    const config = resolveTelegramWorkerConfig(
      {
        ...defaultSettings,
        voice: {
          ...defaultSettings.voice,
          enabled: true,
        },
      },
      credentials
    )

    // Assert
    expect(config.enabled).toBe(true)
    expect(config.botToken).toBe("bot-token")
    expect(config.allowedUserId).toBe(1001)
    expect(config.promptTimeoutMs).toBe(300_000)
    expect(config.voice.enabled).toBe(true)
    expect(config.transcription.model).toBe("small")
  })

  it("throws when bot token is missing", () => {
    // Arrange
    const credentials = {
      botToken: null,
      allowedUserId: 1001,
    }

    // Act and Assert
    expect(() => resolveTelegramWorkerConfig(defaultSettings, credentials)).toThrow(
      "TELEGRAM_BOT_TOKEN"
    )
  })

  it("throws when allowed user id is missing", () => {
    // Arrange
    const credentials = {
      botToken: "bot-token",
      allowedUserId: null,
    }

    // Act and Assert
    expect(() => resolveTelegramWorkerConfig(defaultSettings, credentials)).toThrow(
      "TELEGRAM_ALLOWED_USER_ID"
    )
  })

  it("throws when transcription base URL is invalid", () => {
    // Arrange
    const credentials = {
      botToken: "bot-token",
      allowedUserId: 1001,
    }

    // Act and Assert
    expect(() =>
      resolveTelegramWorkerConfig(
        {
          ...defaultSettings,
          transcription: {
            ...defaultSettings.transcription,
            baseUrl: "localhost:9000",
          },
        },
        credentials
      )
    ).toThrow("transcription.baseUrl")
  })

  it("migrates legacy Parakeet worker model to whisper default", () => {
    // Arrange
    const credentials = {
      botToken: "bot-token",
      allowedUserId: 1001,
    }

    // Act
    const config = resolveTelegramWorkerConfig(
      {
        ...defaultSettings,
        transcription: {
          ...defaultSettings.transcription,
          provider: "worker",
          model: "parakeet-v3",
          language: "en-US",
        },
      },
      credentials
    )

    // Assert
    expect(config.transcription.model).toBe("small")
    expect(config.transcription.language).toBe("auto")
  })
})
