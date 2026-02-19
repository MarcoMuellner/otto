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
    "Read the current notification profile (quiet hours, heartbeat windows, mute state).",
  args: {},
  async execute(_args): Promise<string> {
    const { baseUrl, token } = resolveInternalApiConfiguration()
    const response = await fetch(`${baseUrl}/internal/tools/notification-profile/get`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        lane: "interactive",
      }),
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`Get notification profile request failed (${response.status}): ${body}`)
    }

    return JSON.stringify(await response.json())
  },
})
