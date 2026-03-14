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
  description: "Update one user-owned prompt file by relative path.",
  args: {
    path: tool.schema.string().min(1).describe("Relative prompt file path under ~/.otto/prompts"),
    content: tool.schema.string().min(1).describe("Complete markdown file content to write"),
  },
  async execute(args): Promise<string> {
    const { baseUrl, token } = resolveInternalApiConfiguration()
    const response = await fetch(`${baseUrl}/internal/tools/prompts/file/set`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        lane: "interactive",
        source: "user",
        ...args,
      }),
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`Set prompt file request failed (${response.status}): ${body}`)
    }

    return JSON.stringify(await response.json())
  },
})
