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
  description: "Read one managed prompt file by source and relative path.",
  args: {
    source: tool.schema.enum(["system", "user"]).describe("Prompt file source ownership"),
    path: tool.schema
      .string()
      .min(1)
      .describe("Relative prompt file path, for example layers/surface-telegram.md"),
  },
  async execute(args): Promise<string> {
    const { baseUrl, token } = resolveInternalApiConfiguration()
    const response = await fetch(`${baseUrl}/internal/tools/prompts/file/get`, {
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
      throw new Error(`Get prompt file request failed (${response.status}): ${body}`)
    }

    return JSON.stringify(await response.json())
  },
})
