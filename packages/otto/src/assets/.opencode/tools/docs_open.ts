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
  description:
    "Open one Otto docs page (including /live) with optional version/section and structured references.",
  args: {
    slug: tool.schema.string().min(1).describe("Docs slug path, for example /docs/intro or /live"),
    version: tool.schema
      .string()
      .min(1)
      .optional()
      .describe("Optional docs version, for example v1.2.3"),
    section: tool.schema
      .string()
      .min(1)
      .optional()
      .describe("Optional section anchor without # prefix"),
  },
  async execute(args): Promise<string> {
    const { baseUrl, token } = resolveInternalApiConfiguration()
    const response = await fetch(`${baseUrl}/internal/tools/docs/open`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(args),
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`Docs open request failed (${response.status}): ${body}`)
    }

    return JSON.stringify(await response.json())
  },
})
