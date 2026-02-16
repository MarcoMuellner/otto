import { z } from "zod"

export type TelegramWorkerConfig = {
  enabled: boolean
  botToken: string | null
  heartbeatMs: number
}

const telegramWorkerConfigSchema = z.object({
  OTTO_TELEGRAM_WORKER_ENABLED: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  OTTO_TELEGRAM_WORKER_HEARTBEAT_MS: z.string().optional(),
})

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

  const botToken = parsed.data.TELEGRAM_BOT_TOKEN?.trim() || null

  return {
    enabled,
    botToken,
    heartbeatMs,
  }
}
