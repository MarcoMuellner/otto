import { tool } from "@opencode-ai/plugin"

type CheckTaskFailuresResponse = {
  lookbackMinutes: number
  maxFailures: number
  threshold: number
  failedCount: number
  shouldAlert: boolean
  notified: boolean
  notificationStatus: "not_requested" | "enqueued" | "duplicate" | "no_chat_id"
  dedupeKey: string | null
  failures: Array<{
    runId: string
    jobId: string
    jobType: string
    startedAt: number
    errorCode: string | null
    errorMessage: string | null
  }>
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
  description: "Check recent scheduled task failures and optionally send a watchdog alert.",
  args: {
    lookbackMinutes: tool.schema
      .number()
      .int()
      .min(5)
      .max(24 * 60)
      .optional()
      .describe("Failure lookback window in minutes"),
    maxFailures: tool.schema
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .describe("Maximum number of failed runs to inspect"),
    threshold: tool.schema
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe("Minimum failed run count required for an alert"),
    notify: tool.schema
      .boolean()
      .optional()
      .describe("Whether to queue a Telegram alert when threshold is met"),
    chatId: tool.schema
      .number()
      .int()
      .positive()
      .optional()
      .describe("Optional explicit Telegram chat id for alerts"),
  },
  async execute(args, context): Promise<string> {
    const { baseUrl, token } = resolveInternalApiConfiguration()
    const response = await fetch(`${baseUrl}/internal/tools/tasks/failures/check`, {
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
      throw new Error(`Check task failures request failed (${response.status}): ${body}`)
    }

    const result = (await response.json()) as CheckTaskFailuresResponse
    return JSON.stringify(result)
  },
})
