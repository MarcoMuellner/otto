import { z } from "zod"

export type TelegramWorkerConfig = {
  enabled: boolean
  botToken: string
  allowedUserId: number
  allowedChatId: number
  heartbeatMs: number
}

const telegramWorkerConfigSchema = z.object({
  OTTO_TELEGRAM_WORKER_ENABLED: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_ALLOWED_USER_ID: z.string().optional(),
  TELEGRAM_ALLOWED_CHAT_ID: z.string().optional(),
  OTTO_TELEGRAM_WORKER_HEARTBEAT_MS: z.string().optional(),
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

  if (!enabled) {
    return {
      enabled,
      botToken,
      allowedUserId: 0,
      allowedChatId: 0,
      heartbeatMs,
    }
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
  }
}
