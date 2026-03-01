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
  description: "Show details for one interactive background task by job_id.",
  args: {
    jobId: tool.schema.string().min(1).describe("Canonical background task job_id"),
  },
  async execute(args): Promise<string> {
    const { baseUrl, token } = resolveInternalApiConfiguration()
    const response = await fetch(`${baseUrl}/internal/tools/background-jobs/show`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        lane: "interactive",
        jobId: args.jobId,
      }),
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`Show background task request failed (${response.status}): ${body}`)
    }

    return JSON.stringify(await response.json())
  },
})
