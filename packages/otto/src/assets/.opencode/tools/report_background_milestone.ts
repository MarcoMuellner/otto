import { tool } from "@opencode-ai/plugin"

type ReportBackgroundMilestoneResponse = {
  status: "enqueued" | "duplicate"
  queuedCount: number
  duplicateCount: number
  messageIds: string[]
  dedupeKey: string | null
  taskId: string
  runId: string
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
    "Report a background-run milestone update to Telegram with per-task throttling and traceable run context.",
  args: {
    content: tool.schema.string().min(1).describe("Natural-language milestone update"),
    taskId: tool.schema
      .string()
      .min(1)
      .optional()
      .describe("Optional explicit background task id fallback"),
    runId: tool.schema.string().min(1).optional().describe("Optional explicit run id fallback"),
    chatId: tool.schema
      .number()
      .int()
      .positive()
      .optional()
      .describe("Optional explicit Telegram chat id override"),
  },
  async execute(args, context): Promise<string> {
    const { baseUrl, token } = resolveInternalApiConfiguration()
    const response = await fetch(`${baseUrl}/internal/tools/background-jobs/milestone`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        lane: "interactive",
        sessionId: context.sessionID,
        ...args,
      }),
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`Report background milestone request failed (${response.status}): ${body}`)
    }

    const result = (await response.json()) as ReportBackgroundMilestoneResponse
    return JSON.stringify(result)
  },
})
