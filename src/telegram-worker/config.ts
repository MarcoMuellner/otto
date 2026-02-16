import { z } from "zod"

export type TelegramWorkerConfig = {
  enabled: boolean
  botToken: string
  allowedUserId: number
  allowedChatId: number
  heartbeatMs: number
  outboundPollMs: number
  outboundMaxAttempts: number
  outboundRetryBaseMs: number
  outboundRetryMaxMs: number
  opencodeBaseUrl: string
  promptTimeoutMs: number
}

const telegramWorkerConfigSchema = z.object({
  OTTO_TELEGRAM_WORKER_ENABLED: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_ALLOWED_USER_ID: z.string().optional(),
  TELEGRAM_ALLOWED_CHAT_ID: z.string().optional(),
  OTTO_TELEGRAM_WORKER_HEARTBEAT_MS: z.string().optional(),
  OTTO_TELEGRAM_OUTBOUND_POLL_MS: z.string().optional(),
  OTTO_TELEGRAM_OUTBOUND_MAX_ATTEMPTS: z.string().optional(),
  OTTO_TELEGRAM_OUTBOUND_RETRY_BASE_MS: z.string().optional(),
  OTTO_TELEGRAM_OUTBOUND_RETRY_MAX_MS: z.string().optional(),
  OTTO_OPENCODE_BASE_URL: z.string().optional(),
  OTTO_TELEGRAM_PROMPT_TIMEOUT_MS: z.string().optional(),
})

/**
 * Parses a required Telegram identifier so authorization policy can be configured explicitly
 * and never inferred from runtime traffic.
 *
 * @param rawValue Raw identifier value from environment.
 * @param label Environment variable label used for diagnostics.
 * @returns Valid Telegram numeric identifier.
 */
const parseTelegramId = (rawValue: string | undefined, label: string): number => {
  if (!rawValue) {
    throw new Error(`Invalid Telegram worker config: ${label} is required`)
  }

  const parsedValue = Number(rawValue)
  if (!Number.isInteger(parsedValue) || parsedValue < 1) {
    throw new Error(`Invalid Telegram worker config: ${label} must be an integer >= 1`)
  }

  return parsedValue
}

/**
 * Resolves Telegram worker runtime settings from environment so process behavior is explicit
 * and can be tuned operationally without source edits.
 *
 * @param environment Environment source, defaulting to process.env.
 * @returns Normalized Telegram worker configuration.
 */
export const resolveTelegramWorkerConfig = (
  environment: NodeJS.ProcessEnv = process.env
): TelegramWorkerConfig => {
  const parsed = telegramWorkerConfigSchema.safeParse(environment)

  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
      .join("; ")

    throw new Error(`Invalid Telegram worker config: ${detail}`)
  }

  const rawEnabled = parsed.data.OTTO_TELEGRAM_WORKER_ENABLED
  const enabled = rawEnabled == null ? true : rawEnabled !== "0"

  const rawHeartbeatMs = parsed.data.OTTO_TELEGRAM_WORKER_HEARTBEAT_MS
  const heartbeatMs = rawHeartbeatMs == null ? 60_000 : Number(rawHeartbeatMs)

  if (!Number.isInteger(heartbeatMs) || heartbeatMs < 1_000) {
    throw new Error(
      "Invalid Telegram worker config: OTTO_TELEGRAM_WORKER_HEARTBEAT_MS must be an integer >= 1000"
    )
  }

  const botToken = parsed.data.TELEGRAM_BOT_TOKEN?.trim() || ""
  const rawOutboundPollMs = parsed.data.OTTO_TELEGRAM_OUTBOUND_POLL_MS
  const outboundPollMs = rawOutboundPollMs == null ? 2_000 : Number(rawOutboundPollMs)
  if (!Number.isInteger(outboundPollMs) || outboundPollMs < 250) {
    throw new Error(
      "Invalid Telegram worker config: OTTO_TELEGRAM_OUTBOUND_POLL_MS must be an integer >= 250"
    )
  }

  const rawOutboundMaxAttempts = parsed.data.OTTO_TELEGRAM_OUTBOUND_MAX_ATTEMPTS
  const outboundMaxAttempts = rawOutboundMaxAttempts == null ? 5 : Number(rawOutboundMaxAttempts)
  if (!Number.isInteger(outboundMaxAttempts) || outboundMaxAttempts < 1) {
    throw new Error(
      "Invalid Telegram worker config: OTTO_TELEGRAM_OUTBOUND_MAX_ATTEMPTS must be an integer >= 1"
    )
  }

  const rawOutboundRetryBaseMs = parsed.data.OTTO_TELEGRAM_OUTBOUND_RETRY_BASE_MS
  const outboundRetryBaseMs =
    rawOutboundRetryBaseMs == null ? 5_000 : Number(rawOutboundRetryBaseMs)
  if (!Number.isInteger(outboundRetryBaseMs) || outboundRetryBaseMs < 250) {
    throw new Error(
      "Invalid Telegram worker config: OTTO_TELEGRAM_OUTBOUND_RETRY_BASE_MS must be an integer >= 250"
    )
  }

  const rawOutboundRetryMaxMs = parsed.data.OTTO_TELEGRAM_OUTBOUND_RETRY_MAX_MS
  const outboundRetryMaxMs = rawOutboundRetryMaxMs == null ? 300_000 : Number(rawOutboundRetryMaxMs)
  if (!Number.isInteger(outboundRetryMaxMs) || outboundRetryMaxMs < outboundRetryBaseMs) {
    throw new Error(
      "Invalid Telegram worker config: OTTO_TELEGRAM_OUTBOUND_RETRY_MAX_MS must be an integer >= OTTO_TELEGRAM_OUTBOUND_RETRY_BASE_MS"
    )
  }

  if (!enabled) {
    return {
      enabled,
      botToken,
      allowedUserId: 0,
      allowedChatId: 0,
      heartbeatMs,
      outboundPollMs,
      outboundMaxAttempts,
      outboundRetryBaseMs,
      outboundRetryMaxMs,
      opencodeBaseUrl: parsed.data.OTTO_OPENCODE_BASE_URL?.trim() || "http://127.0.0.1:4096",
      promptTimeoutMs: 120_000,
    }
  }

  const rawPromptTimeoutMs = parsed.data.OTTO_TELEGRAM_PROMPT_TIMEOUT_MS
  const promptTimeoutMs = rawPromptTimeoutMs == null ? 120_000 : Number(rawPromptTimeoutMs)
  if (!Number.isInteger(promptTimeoutMs) || promptTimeoutMs < 5_000) {
    throw new Error(
      "Invalid Telegram worker config: OTTO_TELEGRAM_PROMPT_TIMEOUT_MS must be an integer >= 5000"
    )
  }

  const opencodeBaseUrl = parsed.data.OTTO_OPENCODE_BASE_URL?.trim() || "http://127.0.0.1:4096"
  if (!/^https?:\/\//.test(opencodeBaseUrl)) {
    throw new Error(
      "Invalid Telegram worker config: OTTO_OPENCODE_BASE_URL must start with http:// or https://"
    )
  }

  const allowedUserId = parseTelegramId(
    parsed.data.TELEGRAM_ALLOWED_USER_ID,
    "TELEGRAM_ALLOWED_USER_ID"
  )
  const allowedChatId = parseTelegramId(
    parsed.data.TELEGRAM_ALLOWED_CHAT_ID,
    "TELEGRAM_ALLOWED_CHAT_ID"
  )

  if (enabled && botToken.length === 0) {
    throw new Error("Invalid Telegram worker config: TELEGRAM_BOT_TOKEN is required")
  }

  return {
    enabled,
    botToken,
    allowedUserId,
    allowedChatId,
    heartbeatMs,
    outboundPollMs,
    outboundMaxAttempts,
    outboundRetryBaseMs,
    outboundRetryMaxMs,
    opencodeBaseUrl,
    promptTimeoutMs,
  }
}
