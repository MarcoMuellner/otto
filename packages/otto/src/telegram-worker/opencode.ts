import { createOpencodeClient } from "@opencode-ai/sdk"
import type { Logger } from "pino"

import type { ResolvedRuntimeModel, RuntimeModelFlow } from "../model-management/index.js"

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
  source: string
}

type SessionModelContext = {
  flow: RuntimeModelFlow
  jobModelRef?: string | null
}

export type OpencodeSessionGateway = {
  ensureSession: (sessionId: string | null) => Promise<string>
  closeSession?: (sessionId: string) => Promise<void>
  promptSessionParts: (
    sessionId: string,
    parts: OpencodePromptPart[],
    options?: {
      systemPrompt?: string
      tools?: Record<string, boolean>
      agent?: string
      modelContext?: SessionModelContext
    }
  ) => Promise<string>
  promptSession: (
    sessionId: string,
    text: string,
    options?: {
      systemPrompt?: string
      tools?: Record<string, boolean>
      agent?: string
      modelContext?: SessionModelContext
    }
  ) => Promise<string>
}

export type OpencodePromptPart =
  | {
      type: "text"
      text: string
    }
  | {
      type: "file"
      mime: string
      filename?: string
      url: string
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
    source: "global_default",
  }
}

type ModelResolver = {
  resolve: (input: {
    flow: RuntimeModelFlow
    jobModelRef: string | null
  }) => Promise<ResolvedRuntimeModel>
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
  logger?: Logger,
  modelResolver?: ModelResolver
): OpencodeSessionGateway => {
  const client = createOpencodeClient({ baseUrl, throwOnError: true })
  const sessionApi = client.session
  let modelSelectionPromise: Promise<ModelSelection> | null = null

  const promptSessionParts = async (
    sessionId: string,
    parts: OpencodePromptPart[],
    options?: {
      systemPrompt?: string
      tools?: Record<string, boolean>
      agent?: string
      modelContext?: SessionModelContext
    }
  ): Promise<string> => {
    let modelSelection: ModelSelection

    if (options?.modelContext && modelResolver) {
      modelSelection = await modelResolver.resolve({
        flow: options.modelContext.flow,
        jobModelRef: options.modelContext.jobModelRef ?? null,
      })
    } else {
      modelSelectionPromise ??= resolveModelSelection(client.config)
      modelSelection = await modelSelectionPromise
    }

    logger?.info(
      {
        baseUrl,
        sessionId,
        providerId: modelSelection.providerId,
        modelId: modelSelection.modelId,
        modelSource: modelSelection.source,
        partsCount: parts.length,
      },
      "Sending Telegram prompt to OpenCode session chat API"
    )

    const response = await sessionApi.chat({
      path: { id: sessionId },
      body: {
        providerID: modelSelection.providerId,
        modelID: modelSelection.modelId,
        agent: options?.agent,
        system: options?.systemPrompt,
        tools: options?.tools,
        parts,
      },
    })

    const payload = response.data
    if (!payload) {
      throw new Error("OpenCode chat response missing data payload")
    }

    return extractAssistantText(payload)
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
    closeSession: async (sessionId) => {
      const authorization = process.env.OPENCODE_AUTH_TOKEN?.trim()
      const headers: Record<string, string> = authorization
        ? {
            authorization: `Bearer ${authorization}`,
          }
        : {}

      const abortResponse = await fetch(
        `${baseUrl}/session/${encodeURIComponent(sessionId)}/abort`,
        {
          method: "POST",
          headers,
        }
      )

      if (!abortResponse.ok && abortResponse.status !== 404) {
        const body = await abortResponse.text()
        throw new Error(
          `OpenCode session abort failed (${abortResponse.status}): ${body || "no response body"}`
        )
      }

      const deleteResponse = await fetch(`${baseUrl}/session/${encodeURIComponent(sessionId)}`, {
        method: "DELETE",
        headers,
      })

      if (!deleteResponse.ok && deleteResponse.status !== 404) {
        const body = await deleteResponse.text()
        throw new Error(
          `OpenCode session delete failed (${deleteResponse.status}): ${body || "no response body"}`
        )
      }
    },
    promptSessionParts,
    promptSession: async (sessionId, text, options) => {
      return await promptSessionParts(sessionId, [{ type: "text", text }], options)
    },
  }
}
