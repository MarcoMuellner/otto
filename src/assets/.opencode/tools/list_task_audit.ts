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
  description: "List recent task mutation and command execution audit logs.",
  args: {
    limit: tool.schema
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .describe("Max number of records per audit stream"),
  },
  async execute(args): Promise<string> {
    const { baseUrl, token } = resolveInternalApiConfiguration()
    const response = await fetch(`${baseUrl}/internal/tools/tasks/audit/list`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        lane: "interactive",
        limit: args.limit,
      }),
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`List task audit request failed (${response.status}): ${body}`)
    }

    return JSON.stringify(await response.json())
  },
})
