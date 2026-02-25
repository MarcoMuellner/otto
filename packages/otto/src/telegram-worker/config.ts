import { homedir } from "node:os"
import path from "node:path"
import { readFileSync } from "node:fs"

import type { OttoTelegramSettings } from "../config/otto-config.js"

export type TranscriptionProvider = "command" | "http" | "worker"

export type TelegramVoiceConfig = {
  enabled: boolean
  maxDurationSec: number
  maxBytes: number
  downloadTimeoutMs: number
}

export type TelegramTranscriptionConfig = {
  provider: TranscriptionProvider
  timeoutMs: number
  workerStartupTimeoutMs: number
  language: string
  model: string
  command: string | null
  commandArgs: string[]
  workerScriptPath: string | null
  workerPythonPath: string | null
  baseUrl: string
  httpPath: string
}

export type TelegramWorkerConfig = {
  enabled: boolean
  botToken: string
  allowedUserId: number
  heartbeatMs: number
  outboundPollMs: number
  outboundMaxAttempts: number
  outboundRetryBaseMs: number
  outboundRetryMaxMs: number
  opencodeBaseUrl: string
  promptTimeoutMs: number
  voice: TelegramVoiceConfig
  transcription: TelegramTranscriptionConfig
}

export type TelegramCredentialSource = {
  botToken: string | null
  allowedUserId: number | null
}

const DEFAULT_WORKER_ENABLED = true
const DEFAULT_HEARTBEAT_MS = 60_000
const DEFAULT_OUTBOUND_POLL_MS = 2_000
const DEFAULT_OUTBOUND_MAX_ATTEMPTS = 5
const DEFAULT_OUTBOUND_RETRY_BASE_MS = 5_000
const DEFAULT_OUTBOUND_RETRY_MAX_MS = 300_000
const DEFAULT_OPENCODE_BASE_URL = "http://127.0.0.1:4096"

/**
 * Anchors Telegram credential resolution to a predictable file so runtime startup does not
 * depend on environment variable injection.
 *
 * @param homeDirectory Optional home override used by tests and embedding.
 * @returns Absolute path to telegram credential file.
 */
export const resolveTelegramSecretsFilePath = (homeDirectory = homedir()): string => {
  return path.join(homeDirectory, ".local", "share", "otto", "secrets", "telegram.env")
}

const parseCredentialLines = (source: string): Record<string, string> => {
  const result: Record<string, string> = {}

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line.length === 0 || line.startsWith("#")) {
      continue
    }

    const separator = line.indexOf("=")
    if (separator < 0) {
      continue
    }

    const key = line.slice(0, separator).trim()
    const value = line.slice(separator + 1).trim()

    if (key.length > 0) {
      result[key] = value
    }
  }

  return result
}

/**
 * Loads Telegram credentials from Otto's persisted secrets file so service startup remains
 * deterministic without relying on process environment variables.
 *
 * @param secretsFilePath Optional explicit credential file path used by tests.
 * @returns Parsed Telegram bot token and allowlisted user id.
 */
export const loadTelegramCredentials = (
  secretsFilePath = resolveTelegramSecretsFilePath()
): TelegramCredentialSource => {
  try {
    const raw = readFileSync(secretsFilePath, "utf8")
    const parsed = parseCredentialLines(raw)
    const token = parsed.TELEGRAM_BOT_TOKEN?.trim() || null
    const allowedRaw = parsed.TELEGRAM_ALLOWED_USER_ID?.trim() || null
    const allowed = allowedRaw == null ? null : Number(allowedRaw)

    return {
      botToken: token,
      allowedUserId:
        typeof allowed === "number" && Number.isInteger(allowed) && allowed >= 1 ? allowed : null,
    }
  } catch {
    return {
      botToken: null,
      allowedUserId: null,
    }
  }
}

const parseTranscriptionProvider = (
  provider: OttoTelegramSettings["transcription"]["provider"]
): TranscriptionProvider => {
  if (provider === "command" || provider === "http") {
    return provider
  }

  if (provider === "worker") {
    return provider
  }

  throw new Error(
    "Invalid Telegram worker settings: transcription.provider must be 'command', 'http', or 'worker'"
  )
}

const LEGACY_PARAKEET_MODELS = new Set(["parakeet-v3", "nvidia/parakeet-tdt-0.6b-v3"])

const resolveTranscriptionModel = (
  provider: TranscriptionProvider,
  configuredModel: string
): string => {
  const trimmed = configuredModel.trim()
  if (provider !== "worker") {
    return trimmed
  }

  if (
    trimmed.length === 0 ||
    LEGACY_PARAKEET_MODELS.has(trimmed) ||
    trimmed.toLowerCase().includes("parakeet")
  ) {
    return "small"
  }

  return trimmed
}

const resolveTranscriptionLanguage = (
  provider: TranscriptionProvider,
  configuredLanguage: string
): string => {
  if (provider !== "worker") {
    return configuredLanguage
  }

  return "auto"
}

/**
 * Resolves Telegram worker runtime settings from persisted Otto settings and credential files
 * so startup behavior is stable across install/update flows without env var dependence.
 *
 * @param settings Telegram settings loaded from Otto config.
 * @param credentials Optional explicit credential source used by tests.
 * @returns Normalized Telegram worker configuration.
 */
export const resolveTelegramWorkerConfig = (
  settings: OttoTelegramSettings,
  credentials = loadTelegramCredentials()
): TelegramWorkerConfig => {
  const enabled = DEFAULT_WORKER_ENABLED
  const botToken = credentials.botToken?.trim() || ""
  const allowedUserId = credentials.allowedUserId ?? 0

  if (enabled && botToken.length === 0) {
    throw new Error("Invalid Telegram worker config: TELEGRAM_BOT_TOKEN is required")
  }

  if (enabled && (!Number.isInteger(allowedUserId) || allowedUserId < 1)) {
    throw new Error(
      "Invalid Telegram worker config: TELEGRAM_ALLOWED_USER_ID must be an integer >= 1"
    )
  }

  const provider = parseTranscriptionProvider(settings.transcription.provider)

  if (!/^https?:\/\//.test(settings.transcription.baseUrl)) {
    throw new Error(
      "Invalid Telegram worker settings: transcription.baseUrl must start with http:// or https://"
    )
  }

  if (!settings.transcription.httpPath.startsWith("/")) {
    throw new Error("Invalid Telegram worker settings: transcription.httpPath must start with /")
  }

  return {
    enabled,
    botToken,
    allowedUserId,
    heartbeatMs: DEFAULT_HEARTBEAT_MS,
    outboundPollMs: DEFAULT_OUTBOUND_POLL_MS,
    outboundMaxAttempts: DEFAULT_OUTBOUND_MAX_ATTEMPTS,
    outboundRetryBaseMs: DEFAULT_OUTBOUND_RETRY_BASE_MS,
    outboundRetryMaxMs: DEFAULT_OUTBOUND_RETRY_MAX_MS,
    opencodeBaseUrl: DEFAULT_OPENCODE_BASE_URL,
    promptTimeoutMs: settings.promptTimeoutMs,
    voice: {
      enabled: settings.voice.enabled,
      maxDurationSec: settings.voice.maxDurationSec,
      maxBytes: settings.voice.maxBytes,
      downloadTimeoutMs: settings.voice.downloadTimeoutMs,
    },
    transcription: {
      provider,
      timeoutMs: settings.transcription.timeoutMs,
      workerStartupTimeoutMs: settings.transcription.workerStartupTimeoutMs,
      language: resolveTranscriptionLanguage(provider, settings.transcription.language),
      model: resolveTranscriptionModel(provider, settings.transcription.model),
      command: settings.transcription.command,
      commandArgs: settings.transcription.commandArgs,
      workerScriptPath: settings.transcription.workerScriptPath,
      workerPythonPath: settings.transcription.workerPythonPath,
      baseUrl: settings.transcription.baseUrl,
      httpPath: settings.transcription.httpPath,
    },
  }
}
