export type OpencodeSessionSummary = {
  id: string
  title: string
  updatedAt: number
  createdAt: number
}

export type OpencodeMessage = {
  id: string
  role: "user" | "assistant" | "system" | "tool" | "unknown"
  text: string
  createdAt: number
  partTypes: string[]
}

export type OpencodeChatEvent = {
  type: string
  properties: Record<string, unknown>
}

export type OpencodeRawPart = {
  id: string
  type: string
  text?: string
  tool?: string
  state?: Record<string, unknown>
}

type DynamicSessionApi = {
  list?: (input?: unknown) => Promise<unknown>
  get?: (input: { path: { id: string } }) => Promise<unknown>
  messages?: (input: { path: { id: string } }) => Promise<unknown>
  message?: (input: { path: { id: string; messageID: string } }) => Promise<unknown>
  prompt?: (input: {
    path: { id: string }
    body: { parts: Array<{ type: "text"; text: string }> }
  }) => Promise<unknown>
  promptAsync?: (input: {
    path: { id: string }
    body: { messageID?: string; parts: Array<{ type: "text"; text: string }> }
  }) => Promise<unknown>
  chat?: (input: {
    path: { id: string }
    body: { parts: Array<{ type: "text"; text: string }> }
  }) => Promise<unknown>
  create?: (input: { body?: { title?: string } }) => Promise<unknown>
}

type DynamicEventApi = {
  subscribe?: () => Promise<{
    stream: AsyncIterable<unknown>
  }>
}

type OpencodeChatClientInput = {
  baseUrl: string
  fetchImpl?: typeof fetch
  sessionApi?: DynamicSessionApi
  eventApi?: DynamicEventApi
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

const unwrapData = (value: unknown): unknown => {
  if (isRecord(value) && "data" in value) {
    return value.data
  }

  return value
}

const resolveTimestamp = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value)
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const numeric = Number(value)
    if (Number.isFinite(numeric)) {
      return Math.trunc(numeric)
    }

    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) {
      return Math.trunc(parsed)
    }
  }

  return Date.now()
}

const normalizeRole = (value: unknown): OpencodeMessage["role"] => {
  if (typeof value !== "string") {
    return "unknown"
  }

  const normalized = value.trim().toLowerCase()
  if (
    normalized === "user" ||
    normalized === "assistant" ||
    normalized === "system" ||
    normalized === "tool"
  ) {
    return normalized
  }

  return "unknown"
}

const extractPartTypes = (parts: unknown[]): string[] => {
  const partTypes = new Set<string>()

  for (const part of parts) {
    if (!isRecord(part)) {
      continue
    }

    const type = part.type
    if (typeof type === "string" && type.trim().length > 0) {
      partTypes.add(type)
    }
  }

  return [...partTypes]
}

const summarizeToolOutput = (value: unknown): string | null => {
  const summarizeText = (text: string): string | null => {
    const trimmed = text.trim()
    if (trimmed.length === 0) {
      return null
    }

    const firstLine = trimmed.split(/\r?\n/u)[0]?.trim() ?? trimmed
    return firstLine.length > 180 ? `${firstLine.slice(0, 180)}...` : firstLine
  }

  if (typeof value === "string") {
    const trimmed = value.trim()

    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed) as unknown
        return summarizeToolOutput(parsed)
      } catch {
        return summarizeText(trimmed)
      }
    }

    return summarizeText(trimmed)
  }

  if (isRecord(value)) {
    if (typeof value.summary === "string") {
      return summarizeToolOutput(value.summary)
    }

    if (typeof value.result === "string") {
      return summarizeToolOutput(value.result)
    }

    if (typeof value.message === "string") {
      return summarizeToolOutput(value.message)
    }

    if (typeof value.status === "string") {
      return `status: ${value.status}`
    }
  }

  return null
}

const extractTextFromParts = (parts: unknown[]): string => {
  const chunks: string[] = []

  for (const part of parts) {
    if (!isRecord(part)) {
      continue
    }

    if (part.type === "text" && typeof part.text === "string") {
      chunks.push(part.text)
      continue
    }

    if (part.type === "reasoning" && typeof part.text === "string") {
      const trimmed = part.text.trim()
      if (trimmed.length > 0) {
        chunks.push(`Reasoning: ${trimmed}`)
      }
      continue
    }

    if (part.type === "tool") {
      const toolName =
        typeof part.tool === "string" && part.tool.trim().length > 0 ? part.tool : "tool"
      const state = isRecord(part.state) ? part.state : null
      const status =
        state && typeof state.status === "string" && state.status.trim().length > 0
          ? state.status
          : "completed"
      const outputSummary = summarizeToolOutput(state?.output)

      chunks.push(
        outputSummary
          ? `Tool ${toolName} (${status}): ${outputSummary}`
          : `Tool ${toolName} (${status})`
      )
      continue
    }

    if (part.type === "step-start" || part.type === "step-finish") {
      continue
    }

    if (typeof part.type === "string") {
      chunks.push(`[${part.type}]`)
    }
  }

  return chunks.join("\n").trim()
}

const mapSessionSummary = (input: unknown): OpencodeSessionSummary | null => {
  if (!isRecord(input)) {
    return null
  }

  const timeRecord = isRecord(input.time) ? input.time : null

  const id = input.id
  if (typeof id !== "string" || id.trim().length === 0) {
    return null
  }

  const title =
    typeof input.title === "string" && input.title.trim().length > 0
      ? input.title.trim()
      : `Session ${id.slice(0, 8)}`

  const createdAt = resolveTimestamp(input.createdAt ?? timeRecord?.created)
  const updatedAt = resolveTimestamp(
    input.updatedAt ??
      input.lastActivityAt ??
      timeRecord?.updated ??
      input.createdAt ??
      timeRecord?.created
  )

  return {
    id,
    title,
    createdAt,
    updatedAt,
  }
}

const mapMessage = (input: unknown): OpencodeMessage | null => {
  if (!isRecord(input)) {
    return null
  }

  const hasInfoEnvelope = isRecord(input.info)
  const info: Record<string, unknown> = hasInfoEnvelope
    ? (input.info as Record<string, unknown>)
    : input
  const partsRaw = hasInfoEnvelope ? input.parts : input.parts
  const parts = Array.isArray(partsRaw) ? partsRaw : []

  const id = info.id
  if (typeof id !== "string" || id.trim().length === 0) {
    return null
  }

  return {
    id,
    role: normalizeRole(info.role ?? info.type),
    text: extractTextFromParts(parts),
    createdAt: resolveTimestamp(info.createdAt),
    partTypes: extractPartTypes(parts),
  }
}

const mapMessageParts = (input: unknown): OpencodeRawPart[] => {
  if (!isRecord(input)) {
    return []
  }

  const hasInfoEnvelope = isRecord(input.info)
  const partsRaw = hasInfoEnvelope ? input.parts : input.parts
  if (!Array.isArray(partsRaw)) {
    return []
  }

  const parts: OpencodeRawPart[] = []
  for (const candidate of partsRaw) {
    if (!isRecord(candidate)) {
      continue
    }

    if (typeof candidate.id !== "string" || typeof candidate.type !== "string") {
      continue
    }

    parts.push({
      id: candidate.id,
      type: candidate.type,
      text: typeof candidate.text === "string" ? candidate.text : undefined,
      tool: typeof candidate.tool === "string" ? candidate.tool : undefined,
      state: isRecord(candidate.state) ? candidate.state : undefined,
    })
  }

  return parts
}

const mapEvent = (input: unknown): OpencodeChatEvent | null => {
  if (!isRecord(input)) {
    return null
  }

  const type = input.type
  if (typeof type !== "string" || type.trim().length === 0) {
    return null
  }

  const properties = isRecord(input.properties)
    ? input.properties
    : isRecord(input.payload)
      ? input.payload
      : {}

  return {
    type,
    properties,
  }
}

const toMessageList = (payload: unknown): OpencodeMessage[] => {
  const unwrapped = unwrapData(payload)
  if (!Array.isArray(unwrapped)) {
    return []
  }

  return unwrapped.map(mapMessage).filter((entry): entry is OpencodeMessage => entry !== null)
}

const toSessionList = (payload: unknown): OpencodeSessionSummary[] => {
  const unwrapped = unwrapData(payload)
  if (!Array.isArray(unwrapped)) {
    return []
  }

  return unwrapped
    .map(mapSessionSummary)
    .filter((entry): entry is OpencodeSessionSummary => entry !== null)
}

const toSingleSession = (payload: unknown): OpencodeSessionSummary | null => {
  return mapSessionSummary(unwrapData(payload))
}

const toSingleMessage = (payload: unknown): OpencodeMessage | null => {
  return mapMessage(unwrapData(payload))
}

const resolveStatusCodeFromError = (error: unknown): number | null => {
  if (!(error instanceof Error)) {
    return null
  }

  const match = /\((\d{3})\)/u.exec(error.message)
  if (!match) {
    return null
  }

  const parsed = Number(match[1])
  return Number.isInteger(parsed) ? parsed : null
}

export class OpencodeChatApiError extends Error {
  statusCode: number | null

  constructor(message: string, statusCode: number | null = null) {
    super(message)
    this.name = "OpencodeChatApiError"
    this.statusCode = statusCode
  }
}

const requestJson = async (
  fetchImpl: typeof fetch,
  baseUrl: string,
  endpoint: string,
  init?: RequestInit
): Promise<unknown> => {
  const response = await fetchImpl(new URL(endpoint, baseUrl), init)
  if (!response.ok) {
    throw new OpencodeChatApiError(
      `OpenCode chat request failed for ${endpoint} (${response.status})`,
      response.status
    )
  }

  return (await response.json()) as unknown
}

const requestVoid = async (
  fetchImpl: typeof fetch,
  baseUrl: string,
  endpoint: string,
  init?: RequestInit
): Promise<void> => {
  const response = await fetchImpl(new URL(endpoint, baseUrl), init)
  if (!response.ok) {
    throw new OpencodeChatApiError(
      `OpenCode chat request failed for ${endpoint} (${response.status})`,
      response.status
    )
  }
}

const parseSseDataBlock = (block: string): unknown | null => {
  const payload = block
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("\n")

  if (payload.length === 0) {
    return null
  }

  try {
    return JSON.parse(payload) as unknown
  } catch {
    return null
  }
}

const streamEventsFromSse = async function* (
  fetchImpl: typeof fetch,
  baseUrl: string,
  signal?: AbortSignal
): AsyncGenerator<OpencodeChatEvent> {
  const response = await fetchImpl(new URL("/event", baseUrl), {
    method: "GET",
    headers: {
      accept: "text/event-stream",
    },
    signal,
  })

  if (!response.ok || !response.body) {
    throw new OpencodeChatApiError(
      `OpenCode chat request failed for /event (${response.status})`,
      response.status
    )
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) {
        break
      }

      buffer += decoder.decode(chunk.value, { stream: true })

      while (true) {
        const normalizedBuffer = buffer.replace(/\r\n/gu, "\n")
        const delimiterIndex = normalizedBuffer.indexOf("\n\n")
        if (delimiterIndex < 0) {
          break
        }

        const block = normalizedBuffer.slice(0, delimiterIndex)
        buffer = normalizedBuffer.slice(delimiterIndex + 2)

        const parsed = parseSseDataBlock(block)
        const event = mapEvent(parsed)
        if (event) {
          yield event
        }
      }
    }

    const trailing = parseSseDataBlock(buffer)
    const trailingEvent = mapEvent(trailing)
    if (trailingEvent) {
      yield trailingEvent
    }
  } finally {
    await reader.cancel()
  }
}

/**
 * Creates a server-side OpenCode chat client abstraction used by control-plane chat routes.
 */
export const createOpencodeChatClient = ({
  baseUrl,
  fetchImpl = globalThis.fetch,
  sessionApi,
  eventApi,
}: OpencodeChatClientInput) => {
  const resolvedSessionApi = sessionApi ?? null
  const resolvedEventApi = eventApi ?? null

  const mapError = (error: unknown, endpoint: string): OpencodeChatApiError => {
    if (error instanceof OpencodeChatApiError) {
      return error
    }

    const statusCode = resolveStatusCodeFromError(error)
    const message =
      error instanceof Error
        ? `OpenCode chat request failed for ${endpoint}: ${error.message}`
        : `OpenCode chat request failed for ${endpoint}`

    return new OpencodeChatApiError(message, statusCode)
  }

  return {
    listSessions: async (): Promise<OpencodeSessionSummary[]> => {
      try {
        if (resolvedSessionApi?.list) {
          const payload = await resolvedSessionApi.list()
          return toSessionList(payload)
        }

        const payload = await requestJson(fetchImpl, baseUrl, "/session")
        return toSessionList(payload)
      } catch (error) {
        throw mapError(error, "/session")
      }
    },
    getSession: async (sessionId: string): Promise<OpencodeSessionSummary> => {
      const endpoint = `/session/${encodeURIComponent(sessionId)}`

      try {
        const payload = resolvedSessionApi?.get
          ? await resolvedSessionApi.get({ path: { id: sessionId } })
          : await requestJson(fetchImpl, baseUrl, endpoint)

        const parsed = toSingleSession(payload)
        if (!parsed) {
          throw new OpencodeChatApiError(
            `OpenCode chat returned invalid session payload for ${endpoint}`
          )
        }

        return parsed
      } catch (error) {
        throw mapError(error, endpoint)
      }
    },
    createSession: async (title?: string): Promise<OpencodeSessionSummary> => {
      try {
        const payload = resolvedSessionApi?.create
          ? await resolvedSessionApi.create({
              body: title ? { title } : {},
            })
          : await requestJson(fetchImpl, baseUrl, "/session", {
              method: "POST",
              headers: {
                "content-type": "application/json",
              },
              body: JSON.stringify(title ? { title } : {}),
            })

        const parsed = toSingleSession(payload)
        if (!parsed) {
          throw new OpencodeChatApiError(
            "OpenCode chat returned invalid session payload for /session"
          )
        }

        return parsed
      } catch (error) {
        throw mapError(error, "/session")
      }
    },
    listMessages: async (sessionId: string): Promise<OpencodeMessage[]> => {
      const endpoint = `/session/${encodeURIComponent(sessionId)}/message`

      try {
        const payload = resolvedSessionApi?.messages
          ? await resolvedSessionApi.messages({ path: { id: sessionId } })
          : await requestJson(fetchImpl, baseUrl, endpoint)

        return toMessageList(payload).sort((left, right) => left.createdAt - right.createdAt)
      } catch (error) {
        throw mapError(error, endpoint)
      }
    },
    getMessage: async (sessionId: string, messageId: string) => {
      const endpoint = `/session/${encodeURIComponent(sessionId)}/message/${encodeURIComponent(messageId)}`

      try {
        const payload = resolvedSessionApi?.message
          ? await resolvedSessionApi.message({
              path: {
                id: sessionId,
                messageID: messageId,
              },
            })
          : await requestJson(fetchImpl, baseUrl, endpoint)

        const message = toSingleMessage(payload)
        if (!message) {
          return null
        }

        return {
          message,
          parts: mapMessageParts(unwrapData(payload)),
        }
      } catch (error) {
        throw mapError(error, endpoint)
      }
    },
    promptSession: async (sessionId: string, text: string): Promise<OpencodeMessage | null> => {
      const endpoint = `/session/${encodeURIComponent(sessionId)}/message`
      const body = {
        parts: [{ type: "text" as const, text }],
      }

      try {
        const payload = resolvedSessionApi?.prompt
          ? await resolvedSessionApi.prompt({
              path: { id: sessionId },
              body,
            })
          : resolvedSessionApi?.chat
            ? await resolvedSessionApi.chat({
                path: { id: sessionId },
                body,
              })
            : await requestJson(fetchImpl, baseUrl, endpoint, {
                method: "POST",
                headers: {
                  "content-type": "application/json",
                },
                body: JSON.stringify(body),
              })

        const message = toSingleMessage(payload)
        return message
      } catch (error) {
        throw mapError(error, endpoint)
      }
    },
    promptSessionAsync: async (sessionId: string, text: string, messageId?: string): Promise<void> => {
      const endpoint = `/session/${encodeURIComponent(sessionId)}/prompt_async`
      const body = {
        ...(messageId ? { messageID: messageId } : {}),
        parts: [{ type: "text" as const, text }],
      }

      try {
        if (resolvedSessionApi?.promptAsync) {
          await resolvedSessionApi.promptAsync({
            path: { id: sessionId },
            body,
          })
          return
        }

        await requestVoid(fetchImpl, baseUrl, endpoint, {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
        })
      } catch (error) {
        throw mapError(error, endpoint)
      }
    },
    subscribeEvents: async function* (signal?: AbortSignal): AsyncGenerator<OpencodeChatEvent> {
      try {
        if (resolvedEventApi?.subscribe) {
          const subscription = await resolvedEventApi.subscribe()

          for await (const rawEvent of subscription.stream) {
            const event = mapEvent(rawEvent)
            if (event) {
              yield event
            }
          }

          return
        }

        yield* streamEventsFromSse(fetchImpl, baseUrl, signal)
      } catch (error) {
        throw mapError(error, "/event")
      }
    },
  }
}
