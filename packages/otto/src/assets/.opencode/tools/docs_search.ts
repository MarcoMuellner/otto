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
  description: "Search Otto docs by keyword and return structured references.",
  args: {
    query: tool.schema.string().min(1).describe("Search keyword or phrase"),
    version: tool.schema
      .string()
      .min(1)
      .optional()
      .describe("Optional docs version, for example v1.2.3"),
    limit: tool.schema.number().int().min(1).max(50).optional().describe("Maximum result count"),
  },
  async execute(args): Promise<string> {
    const { baseUrl, token } = resolveInternalApiConfiguration()
    const response = await fetch(`${baseUrl}/internal/tools/docs/search`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(args),
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`Docs search request failed (${response.status}): ${body}`)
    }

    return JSON.stringify(await response.json())
  },
})
