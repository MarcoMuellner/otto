import type { Logger } from "pino"

export type TelegramAccessPolicy = {
  allowedUserId: number
}

export type TelegramAccessContext = {
  userId: number | null
  chatId: number | null
  chatType: string | null
}

export type TelegramAccessReason =
  | "authorized"
  | "missing_user"
  | "missing_chat"
  | "non_private_chat"
  | "user_not_allowed"

export type TelegramAccessDecision = {
  allowed: boolean
  reason: TelegramAccessReason
}

const parseNumericId = (value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return null
  }

  return value
}

/**
 * Extracts authorization-relevant Telegram metadata so access checks remain deterministic
 * and independent from transport-specific handler code.
 *
 * @param update Telegram update payload.
 * @returns Minimal context required to evaluate allowlist policy.
 */
export const extractTelegramAccessContext = (update: unknown): TelegramAccessContext => {
  if (typeof update !== "object" || update == null) {
    return { userId: null, chatId: null, chatType: null }
  }

  const payload = update as {
    message?: { from?: { id?: unknown }; chat?: { id?: unknown; type?: unknown } }
  }

  const userId = parseNumericId(payload.message?.from?.id)
  const chatId = parseNumericId(payload.message?.chat?.id)
  const chatType =
    typeof payload.message?.chat?.type === "string" ? payload.message.chat.type : null

  return {
    userId,
    chatId,
    chatType,
  }
}

/**
 * Applies single-user direct-message policy so proactive/autonomous logic never runs for
 * unauthorized senders or non-private chats.
 *
 * @param context Parsed access context from Telegram update payload.
 * @param policy Allowed user identifier.
 * @returns Authorization decision and diagnostic reason.
 */
export const evaluateTelegramAccess = (
  context: TelegramAccessContext,
  policy: TelegramAccessPolicy
): TelegramAccessDecision => {
  if (context.userId == null) {
    return { allowed: false, reason: "missing_user" }
  }

  if (context.chatId == null) {
    return { allowed: false, reason: "missing_chat" }
  }

  if (context.chatType !== "private") {
    return { allowed: false, reason: "non_private_chat" }
  }

  if (context.userId !== policy.allowedUserId) {
    return { allowed: false, reason: "user_not_allowed" }
  }

  return { allowed: true, reason: "authorized" }
}

/**
 * Emits auditable security telemetry for denied Telegram updates so operators can investigate
 * suspicious traffic without leaking details to unauthorized users.
 *
 * @param logger Component-scoped logger.
 * @param decision Access evaluation result.
 * @param context Access context associated with decision.
 */
export const logDeniedTelegramAccess = (
  logger: Logger,
  decision: TelegramAccessDecision,
  context: TelegramAccessContext
): void => {
  if (decision.allowed) {
    return
  }

  logger.warn(
    {
      reason: decision.reason,
      userId: context.userId,
      chatId: context.chatId,
      chatType: context.chatType,
    },
    "Telegram update denied by security gate"
  )
}
