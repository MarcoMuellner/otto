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
  description: "Update an existing Otto scheduled task (interactive lane only).",
  args: {
    id: tool.schema.string().min(1).describe("Task identifier"),
    type: tool.schema.string().min(1).optional().describe("Optional task type override"),
    scheduleType: tool.schema
      .enum(["recurring", "oneshot"])
      .optional()
      .describe("Optional schedule type override"),
    runAt: tool.schema.number().int().nullable().optional().describe("Optional run timestamp"),
    cadenceMinutes: tool.schema
      .number()
      .int()
      .min(1)
      .nullable()
      .optional()
      .describe("Optional recurring cadence in minutes"),
    profileId: tool.schema
      .string()
      .min(1)
      .nullable()
      .optional()
      .describe("Optional task profile id override"),
  },
  async execute(args): Promise<string> {
    const { baseUrl, token } = resolveInternalApiConfiguration()
    const response = await fetch(`${baseUrl}/internal/tools/tasks/update`, {
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
      throw new Error(`Update task request failed (${response.status}): ${body}`)
    }

    return JSON.stringify(await response.json())
  },
})
