import { tool } from "@opencode-ai/plugin"

type QueueTelegramFileResponse = {
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
    "Queue a Telegram document or photo for durable outbound delivery with dedupe and retry behavior.",
  args: {
    chatId: tool.schema
      .number()
      .int()
      .optional()
      .describe("Optional target Telegram chat id; defaults to current Telegram session binding"),
    kind: tool.schema.enum(["document", "photo"]).describe("Telegram media type for outbound send"),
    filePath: tool.schema
      .string()
      .min(1)
      .describe("Path to file under ottoHome (absolute or ottoHome-relative)"),
    mimeType: tool.schema.string().min(1).describe("MIME type of the file"),
    fileName: tool.schema.string().min(1).optional().describe("Optional filename override"),
    caption: tool.schema.string().max(4000).optional().describe("Optional caption"),
    dedupeKey: tool.schema
      .string()
      .min(1)
      .max(512)
      .optional()
      .describe("Optional idempotency key for duplicate-safe enqueue"),
    priority: tool.schema
      .enum(["low", "normal", "high", "critical"])
      .optional()
      .describe("Queue priority for this outbound media"),
  },
  async execute(args, context): Promise<string> {
    const { baseUrl, token } = resolveInternalApiConfiguration()
    const response = await fetch(`${baseUrl}/internal/tools/queue-telegram-file`, {
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
      throw new Error(`Queue file request failed (${response.status}): ${body}`)
    }

    const result = (await response.json()) as QueueTelegramFileResponse
    return JSON.stringify(result)
  },
})
