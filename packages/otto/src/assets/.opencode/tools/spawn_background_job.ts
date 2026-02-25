import { tool } from "@opencode-ai/plugin"

type SpawnBackgroundJobResponse = {
  status: "queued"
  jobId: string
  jobType: string
  runAt: number
  acknowledgement: string
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
  description: "Escalate a long-running interactive request into a background one-shot Otto job.",
  args: {
    request: tool.schema
      .string()
      .min(1)
      .describe("Exact user request to run asynchronously in the background"),
    rationale: tool.schema
      .string()
      .min(1)
      .max(500)
      .optional()
      .describe("Optional brief reason for escalation"),
    sourceMessageId: tool.schema
      .string()
      .min(1)
      .optional()
      .describe("Optional source message identifier for traceability"),
  },
  async execute(args, context): Promise<string> {
    const { baseUrl, token } = resolveInternalApiConfiguration()
    const response = await fetch(`${baseUrl}/internal/tools/background-jobs/spawn`, {
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
      throw new Error(`Spawn background job request failed (${response.status}): ${body}`)
    }

    const result = (await response.json()) as SpawnBackgroundJobResponse
    return JSON.stringify(result)
  },
})
