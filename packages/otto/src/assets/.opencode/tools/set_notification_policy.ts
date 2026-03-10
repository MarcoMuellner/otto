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
    "Update notification policy settings (quiet hours, temporary mute, watchdog alert toggle and temporary mute, interactive context window size, and context retention cap).",
  args: {
    timezone: tool.schema.string().optional().describe("IANA timezone, e.g. Europe/Vienna"),
    quietHoursStart: tool.schema
      .string()
      .regex(/^(?:[01]?\d|2[0-3]):[0-5]\d$/)
      .nullable()
      .optional()
      .describe("Quiet-hours start HH:MM or null to clear"),
    quietHoursEnd: tool.schema
      .string()
      .regex(/^(?:[01]?\d|2[0-3]):[0-5]\d$/)
      .nullable()
      .optional()
      .describe("Quiet-hours end HH:MM or null to clear"),
    quietMode: tool.schema
      .enum(["critical_only", "off"])
      .optional()
      .describe("Quiet-hours behavior"),
    muteForMinutes: tool.schema
      .number()
      .int()
      .min(1)
      .max(7 * 24 * 60)
      .optional()
      .describe("Temporary mute window in minutes"),
    muteUntil: tool.schema
      .number()
      .int()
      .nullable()
      .optional()
      .describe("Absolute mute-until epoch millis, or null to unmute"),
    watchdogAlertsEnabled: tool.schema
      .boolean()
      .optional()
      .describe("Persistent watchdog alert toggle (true enables alerts, false disables)"),
    watchdogMuteForMinutes: tool.schema
      .number()
      .int()
      .min(1)
      .max(7 * 24 * 60)
      .optional()
      .describe("Temporary mute watchdog alerts for this many minutes"),
    watchdogMuteUntil: tool.schema
      .number()
      .int()
      .nullable()
      .optional()
      .describe("Absolute watchdog mute-until epoch millis, or null to clear"),
    watchdogUnmute: tool.schema
      .boolean()
      .optional()
      .describe("Clear watchdog alert mute window immediately"),
    interactiveContextWindowSize: tool.schema
      .number()
      .int()
      .min(5)
      .max(200)
      .optional()
      .describe("Interactive context event window size used for prompt injection"),
    contextRetentionCap: tool.schema
      .number()
      .int()
      .min(5)
      .max(200)
      .optional()
      .describe("Per-session cap for retained interactive context events"),
    markOnboardingComplete: tool.schema
      .boolean()
      .optional()
      .describe("Mark profile onboarding as complete"),
  },
  async execute(args): Promise<string> {
    const { baseUrl, token } = resolveInternalApiConfiguration()
    const response = await fetch(`${baseUrl}/internal/tools/notification-profile/set`, {
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
      throw new Error(`Set notification profile request failed (${response.status}): ${body}`)
    }

    return JSON.stringify(await response.json())
  },
})
