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
  description: "List recent EOD learning runs from internal history.",
  args: {
    limit: tool.schema
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .describe("Maximum number of runs to return"),
    status: tool.schema.string().min(1).optional().describe("Optional exact run status filter"),
    profileId: tool.schema.string().min(1).optional().describe("Optional exact profile id filter"),
  },
  async execute(args): Promise<string> {
    const { baseUrl, token } = resolveInternalApiConfiguration()
    const response = await fetch(`${baseUrl}/internal/tools/eod-learning/list`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        limit: args.limit,
        status: args.status,
        profileId: args.profileId,
      }),
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`List EOD learning request failed (${response.status}): ${body}`)
    }

    return JSON.stringify(await response.json())
  },
})
