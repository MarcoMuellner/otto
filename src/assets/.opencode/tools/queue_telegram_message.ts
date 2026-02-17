import { tool } from "@opencode-ai/plugin"

type QueueTelegramMessageResponse = {
  status: "enqueued" | "duplicate"
  queuedCount: number
  duplicateCount: number
  messageIds: string[]
  dedupeKey: string | null
}

const resolveInternalApiConfiguration = (): { baseUrl: string; token: string } => {
  const baseUrl = process.env.OTTO_INTERNAL_API_URL?.trim()
  const token = process.env.OTTO_INTERNAL_API_TOKEN?.trim()

  if (!baseUrl) {
    throw new Error("OTTO_INTERNAL_API_URL is not configured")
  }

  if (!token) {
    throw new Error("OTTO_INTERNAL_API_TOKEN is not configured")
  }

  return { baseUrl, token }
}

export default tool({
  description:
    "Queue a Telegram outbound message for durable delivery with dedupe and retry behavior.",
  args: {
    chatId: tool.schema
      .number()
      .int()
      .positive()
      .optional()
      .describe("Optional target Telegram chat id; defaults to current Telegram session binding"),
    content: tool.schema.string().min(1).describe("Message content to send"),
    dedupeKey: tool.schema
      .string()
      .min(1)
      .max(512)
      .optional()
      .describe("Optional idempotency key for duplicate-safe enqueue"),
    priority: tool.schema
      .enum(["low", "normal", "high"])
      .optional()
      .describe("Queue priority for this outbound message"),
  },
  async execute(args, context): Promise<string> {
    const { baseUrl, token } = resolveInternalApiConfiguration()
    const response = await fetch(`${baseUrl}/internal/tools/queue-telegram-message`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        ...args,
        sessionId: context.sessionID,
      }),
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`Queue request failed (${response.status}): ${body}`)
    }

    const result = (await response.json()) as QueueTelegramMessageResponse
    return JSON.stringify(result)
  },
})
