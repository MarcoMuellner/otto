import { createOpencodeClient } from "@opencode-ai/sdk"
import type { Logger } from "pino"

type SessionChatTextPart = {
  type?: string
  text?: string
}

type SessionChatResponsePayload = {
  parts?: SessionChatTextPart[]
}

type ModelSelection = {
  providerId: string
  modelId: string
}

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

const extractAssistantText = (payload: SessionChatResponsePayload): string => {
  const parts = payload.parts ?? []

  return parts
    .filter((part) => part.type === "text")
    .map((part) => part.text ?? "")
    .join("\n")
}

const resolveModelSelection = async (
  configApi: ReturnType<typeof createOpencodeClient>["config"]
): Promise<ModelSelection> => {
  const response = await configApi.get()
  const model = response.data?.model

  if (!model) {
    throw new Error("OpenCode config is missing a default model")
  }

  const slashIndex = model.indexOf("/")
  if (slashIndex <= 0 || slashIndex === model.length - 1) {
    throw new Error(`OpenCode model must be in provider/model format, received: ${model}`)
  }

  return {
    providerId: model.slice(0, slashIndex),
    modelId: model.slice(slashIndex + 1),
  }
}

/**
 * Creates an OpenCode session gateway abstraction so Telegram transport code can preserve
 * session continuity without depending on SDK response internals.
 *
 * @param baseUrl OpenCode server base URL.
 * @returns Session gateway used by Telegram inbound bridge.
 */
export const createOpencodeSessionGateway = (
  baseUrl: string,
  logger?: Logger
): OpencodeSessionGateway => {
  const client = createOpencodeClient({ baseUrl, throwOnError: true })
  const sessionApi = client.session
  let modelSelectionPromise: Promise<ModelSelection> | null = null

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

      const created = await sessionApi.create({
        body: {
          title: "Telegram chat",
        },
      })
      const createdId = created.data?.id

      if (!createdId) {
        throw new Error("OpenCode session creation did not return a session id")
      }

      return createdId
    },
    promptSession: async (sessionId, text) => {
      modelSelectionPromise ??= resolveModelSelection(client.config)
      const modelSelection = await modelSelectionPromise

      logger?.info(
        {
          baseUrl,
          sessionId,
          providerId: modelSelection.providerId,
          modelId: modelSelection.modelId,
          textLength: text.length,
        },
        "Sending Telegram prompt to OpenCode session chat API"
      )

      const response = await sessionApi.chat({
        path: { id: sessionId },
        body: {
          providerID: modelSelection.providerId,
          modelID: modelSelection.modelId,
          parts: [{ type: "text", text }],
        },
      })

      const payload = response.data
      if (!payload) {
        throw new Error("OpenCode chat response missing data payload")
      }

      return extractAssistantText(payload)
    },
  }
}
