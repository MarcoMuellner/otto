export const TELEGRAM_MESSAGE_LIMIT = 4096

/**
 * Splits long assistant replies so Telegram delivery remains reliable and preserves order.
 *
 * @param text Full assistant response text.
 * @param limit Telegram per-message character limit.
 * @returns Ordered chunks ready for Telegram send operations.
 */
export const splitTelegramMessage = (text: string, limit = TELEGRAM_MESSAGE_LIMIT): string[] => {
  if (text.length <= limit) {
    return [text]
  }

  const chunks: string[] = []
  for (let offset = 0; offset < text.length; offset += limit) {
    chunks.push(text.slice(offset, offset + limit))
  }

  return chunks
}

/**
 * Normalizes model output into a Telegram-safe fallback string so users always receive
 * a response even when OpenCode returns non-text parts.
 *
 * @param rawText Text extracted from OpenCode response parts.
 * @returns Non-empty Telegram message text.
 */
export const normalizeAssistantText = (rawText: string): string => {
  const trimmed = rawText.trim()
  if (trimmed.length > 0) {
    return trimmed
  }

  return "I processed your message, but I do not have a text response yet."
}
