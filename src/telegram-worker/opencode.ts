import { createOpencodeClient } from "@opencode-ai/sdk"

export type OpencodeSessionGateway = {
  ensureSession: (sessionId: string | null) => Promise<string>
  promptSession: (sessionId: string, text: string) => Promise<string>
}

const isNotFoundError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false
  }

  const message = error.message.toLowerCase()
  return message.includes("not found") || message.includes("404")
}

const extractAssistantText = (response: unknown): string => {
  const payload = response as { data?: { parts?: Array<{ type?: string; text?: string }> } }
  const parts = payload.data?.parts ?? []

  return parts
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("\n")
}

/**
 * Creates an OpenCode session gateway abstraction so Telegram transport code can preserve
 * session continuity without depending on SDK response internals.
 *
 * @param baseUrl OpenCode server base URL.
 * @returns Session gateway used by Telegram inbound bridge.
 */
export const createOpencodeSessionGateway = (baseUrl: string): OpencodeSessionGateway => {
  const client = createOpencodeClient({ baseUrl, throwOnError: true })
  const sessionApi = client.session as unknown as {
    get: (input: { path: { id: string } }) => Promise<unknown>
    create: (input: { body: { title: string } }) => Promise<{ data?: { id?: string } }>
    prompt: (input: {
      path: { id: string }
      body: { parts: Array<{ type: "text"; text: string }> }
    }) => Promise<unknown>
  }

  return {
    ensureSession: async (sessionId) => {
      if (sessionId) {
        try {
          await sessionApi.get({ path: { id: sessionId } })
          return sessionId
        } catch (error) {
          if (!isNotFoundError(error)) {
            throw error
          }
        }
      }

      const created = await sessionApi.create({ body: { title: "Telegram chat" } })
      const createdId = created.data?.id

      if (!createdId) {
        throw new Error("OpenCode session creation did not return a session id")
      }

      return createdId
    },
    promptSession: async (sessionId, text) => {
      const response = await sessionApi.prompt({
        path: { id: sessionId },
        body: {
          parts: [{ type: "text", text }],
        },
      })

      return extractAssistantText(response)
    },
  }
}
