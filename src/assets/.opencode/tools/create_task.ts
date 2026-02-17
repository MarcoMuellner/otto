import { tool } from "@opencode-ai/plugin"

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
  description: "Create a scheduled task in Otto (interactive lane only).",
  args: {
    type: tool.schema.string().min(1).describe("Task type identifier"),
    scheduleType: tool.schema.enum(["recurring", "oneshot"]).describe("Task schedule type"),
    runAt: tool.schema
      .number()
      .int()
      .optional()
      .describe("Unix epoch milliseconds for first run; required for oneshot"),
    cadenceMinutes: tool.schema
      .number()
      .int()
      .min(1)
      .optional()
      .describe("Recurring cadence in minutes; required for recurring tasks"),
    profileId: tool.schema.string().min(1).optional().describe("Optional task profile id"),
    payload: tool.schema
      .record(tool.schema.string(), tool.schema.any())
      .optional()
      .describe("Optional task payload object"),
  },
  async execute(args): Promise<string> {
    const { baseUrl, token } = resolveInternalApiConfiguration()
    const response = await fetch(`${baseUrl}/internal/tools/tasks/create`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        lane: "interactive",
        ...args,
      }),
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`Create task request failed (${response.status}): ${body}`)
    }

    return JSON.stringify(await response.json())
  },
})
