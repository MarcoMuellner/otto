import type {
  ChatStreamEvent,
  ChatMessage,
  ChatMessagesResponse,
  ChatThread,
  ChatThreadBinding,
  ChatThreadsResponse,
} from "../features/chat/contracts.js"
import { resolveCachedControlPlaneChatConfig } from "./chat-env.server.js"
import {
  listSessionBindings,
  type SessionBindingRow,
  insertCommandAudit,
} from "./otto-state.server.js"
import {
  createOpencodeChatClient,
  OpencodeChatApiError,
  type OpencodeChatEvent,
  type OpencodeMessage,
  type OpencodeSessionSummary,
} from "./opencode-chat.server.js"
import { createOttoExternalApiClientFromEnvironment } from "./otto-external-api.server.js"

type ChatSurfaceServiceDependencies = {
  resolveConfig: typeof resolveCachedControlPlaneChatConfig
  listSessionBindings: typeof listSessionBindings
  insertCommandAudit: typeof insertCommandAudit
  createOpencodeChatClient: typeof createOpencodeChatClient
  resolveInteractiveSystemPrompt?: () => Promise<string | undefined>
  now?: () => number
}

const INTERACTIVE_PROMPT_RESOLUTION_TIMEOUT_MS = 2_000

type PromptResolutionStatus = "resolved" | "fallback" | "disabled" | "empty"

const resolveInteractivePromptForSurface = async (
  dependencies: ChatSurfaceServiceDependencies
): Promise<{
  systemPrompt: string | undefined
  status: PromptResolutionStatus
}> => {
  if (!dependencies.resolveInteractiveSystemPrompt) {
    return {
      systemPrompt: undefined,
      status: "disabled",
    }
  }

  let timeoutId: ReturnType<typeof setTimeout> | null = null

  try {
    const resolved = await Promise.race([
      dependencies.resolveInteractiveSystemPrompt(),
      new Promise<string | undefined>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error("Interactive prompt resolution timed out"))
        }, INTERACTIVE_PROMPT_RESOLUTION_TIMEOUT_MS)
      }),
    ])

    const trimmed = resolved?.trim() ?? ""
    if (trimmed.length === 0) {
      return {
        systemPrompt: undefined,
        status: "empty",
      }
    }

    return {
      systemPrompt: resolved,
      status: "resolved",
    }
  } catch {
    return {
      systemPrompt: undefined,
      status: "fallback",
    }
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
  }
}

const resolveInteractiveSystemPromptFromRuntime = async (): Promise<string | undefined> => {
  const client = await createOttoExternalApiClientFromEnvironment()
  const resolved = await client.resolveInteractivePrompt("web")
  const trimmed = resolved.systemPrompt.trim()

  return trimmed.length > 0 ? resolved.systemPrompt : undefined
}

const defaultDependencies: ChatSurfaceServiceDependencies = {
  resolveConfig: resolveCachedControlPlaneChatConfig,
  listSessionBindings,
  insertCommandAudit,
  createOpencodeChatClient,
  resolveInteractiveSystemPrompt: resolveInteractiveSystemPromptFromRuntime,
}

type BindingContext = {
  sessionId: string
  updatedAt: number
  bindings: ChatThreadBinding[]
}

const parseBinding = (bindingKey: string): ChatThreadBinding => {
  const telegramMatch = /^telegram:chat:(-?\d+):assistant$/u.exec(bindingKey)
  if (telegramMatch) {
    return {
      key: bindingKey,
      source: "telegram",
      label: `Telegram chat ${telegramMatch[1]}`,
    }
  }

  const schedulerMatch = /^scheduler:task:([^:]+):assistant$/u.exec(bindingKey)
  if (schedulerMatch) {
    return {
      key: bindingKey,
      source: "scheduler",
      label: `Scheduled job ${schedulerMatch[1]}`,
    }
  }

  return {
    key: bindingKey,
    source: "unknown",
    label: bindingKey,
  }
}

const buildBindingContexts = (rows: SessionBindingRow[]): Map<string, BindingContext> => {
  const contexts = new Map<string, BindingContext>()

  for (const row of rows) {
    const existing = contexts.get(row.sessionId)
    const binding = parseBinding(row.bindingKey)

    if (!existing) {
      contexts.set(row.sessionId, {
        sessionId: row.sessionId,
        updatedAt: row.updatedAt,
        bindings: [binding],
      })
      continue
    }

    existing.updatedAt = Math.max(existing.updatedAt, row.updatedAt)
    existing.bindings.push(binding)
  }

  return contexts
}

const toChatThread = (input: {
  session: OpencodeSessionSummary | null
  context: BindingContext | null
}): ChatThread => {
  const sessionId = input.session?.id ?? input.context?.sessionId ?? "unknown"
  const title =
    input.session?.title ??
    (input.context && input.context.bindings.length > 0
      ? (input.context.bindings[0]?.label ?? `Session ${sessionId.slice(0, 8)}`)
      : `Session ${sessionId.slice(0, 8)}`)

  return {
    id: sessionId,
    title,
    updatedAt: Math.max(input.session?.updatedAt ?? 0, input.context?.updatedAt ?? 0),
    isBound: input.context !== null,
    isStale: input.session === null,
    bindings: input.context?.bindings ?? [],
  }
}

const toChatMessage = (message: OpencodeMessage): ChatMessage => {
  return {
    id: message.id,
    role: message.role,
    text: message.text,
    createdAt: message.createdAt,
    partTypes: message.partTypes,
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

const resolveEventSessionId = (event: OpencodeChatEvent): string | null => {
  const sessionId = event.properties.sessionID
  return typeof sessionId === "string" && sessionId.length > 0 ? sessionId : null
}

const resolveAssistantMessageIdFromEvent = (event: OpencodeChatEvent): string | null => {
  if (event.type === "message.updated") {
    const info = isRecord(event.properties.info) ? event.properties.info : null
    if (!info) {
      return null
    }

    if (info.role !== "assistant") {
      return null
    }

    return typeof info.id === "string" && info.id.length > 0 ? info.id : null
  }

  return null
}

const writeAudit = (
  dependencies: ChatSurfaceServiceDependencies,
  databasePath: string,
  input: {
    command: string
    status: "success" | "failed"
    errorMessage: string | null
    metadata: Record<string, unknown>
  }
): void => {
  dependencies.insertCommandAudit(databasePath, {
    command: input.command,
    lane: "interactive",
    status: input.status,
    errorMessage: input.errorMessage,
    metadata: input.metadata,
    createdAt: (dependencies.now ?? Date.now)(),
  })
}

/**
 * Creates chat surface orchestration so control-plane routes can share OpenCode and session-
 * binding merge behavior behind a single testable service boundary.
 */
export const createChatSurfaceService = (
  dependencies: ChatSurfaceServiceDependencies = defaultDependencies
) => {
  return {
    listThreads: async (): Promise<ChatThreadsResponse> => {
      const config = await dependencies.resolveConfig()
      const chatClient = dependencies.createOpencodeChatClient({ baseUrl: config.opencodeApiUrl })

      let bindingRows: SessionBindingRow[] = []
      let sessions: OpencodeSessionSummary[] = []
      let degraded = false
      let degradedMessage: string | undefined

      try {
        bindingRows = dependencies.listSessionBindings(config.stateDatabasePath)
      } catch {
        degraded = true
        degradedMessage = "Could not load persisted session bindings"
      }

      try {
        sessions = await chatClient.listSessions()
      } catch (error) {
        degraded = true
        degradedMessage = "OpenCode sessions are currently unavailable"

        if (bindingRows.length === 0) {
          writeAudit(dependencies, config.stateDatabasePath, {
            command: "chat.list_threads",
            status: "failed",
            errorMessage: error instanceof Error ? error.message : "unknown_error",
            metadata: {
              opencodeApiUrl: config.opencodeApiUrl,
            },
          })

          throw error
        }
      }

      const bindingContexts = buildBindingContexts(bindingRows)
      const threads: ChatThread[] = []
      const seenSessionIds = new Set<string>()

      for (const context of bindingContexts.values()) {
        const session = sessions.find((entry) => entry.id === context.sessionId) ?? null
        threads.push(
          toChatThread({
            session,
            context,
          })
        )
        seenSessionIds.add(context.sessionId)
      }

      for (const session of sessions) {
        if (seenSessionIds.has(session.id)) {
          continue
        }

        threads.push(
          toChatThread({
            session,
            context: null,
          })
        )
      }

      threads.sort((left, right) => right.updatedAt - left.updatedAt)

      writeAudit(dependencies, config.stateDatabasePath, {
        command: "chat.list_threads",
        status: "success",
        errorMessage: null,
        metadata: {
          threadCount: threads.length,
          boundCount: threads.filter((entry) => entry.isBound).length,
          staleCount: threads.filter((entry) => entry.isStale).length,
          degraded,
        },
      })

      const response: {
        threads: ChatThread[]
        degraded: boolean
        message?: string
      } = {
        threads,
        degraded,
      }

      if (degradedMessage) {
        response.message = degradedMessage
      }

      return response
    },
    createThread: async (title?: string): Promise<ChatThread> => {
      const config = await dependencies.resolveConfig()
      const chatClient = dependencies.createOpencodeChatClient({ baseUrl: config.opencodeApiUrl })

      try {
        const session = await chatClient.createSession(title)
        const thread = toChatThread({
          session,
          context: null,
        })

        writeAudit(dependencies, config.stateDatabasePath, {
          command: "chat.create_thread",
          status: "success",
          errorMessage: null,
          metadata: {
            threadId: thread.id,
            title: thread.title,
          },
        })

        return thread
      } catch (error) {
        writeAudit(dependencies, config.stateDatabasePath, {
          command: "chat.create_thread",
          status: "failed",
          errorMessage: error instanceof Error ? error.message : "unknown_error",
          metadata: {
            title: title ?? null,
          },
        })

        throw error
      }
    },
    listMessages: async (threadId: string): Promise<ChatMessagesResponse> => {
      const config = await dependencies.resolveConfig()
      const chatClient = dependencies.createOpencodeChatClient({ baseUrl: config.opencodeApiUrl })

      try {
        const [session, messages] = await Promise.all([
          chatClient.getSession(threadId),
          chatClient.listMessages(threadId),
        ])

        let bindingRows: SessionBindingRow[] = []
        let degraded = false
        let degradedMessage: string | undefined

        try {
          bindingRows = dependencies
            .listSessionBindings(config.stateDatabasePath)
            .filter((entry) => entry.sessionId === threadId)
        } catch {
          degraded = true
          degradedMessage = "Could not load persisted session bindings"
        }

        const bindingContext = buildBindingContexts(bindingRows).get(threadId) ?? null
        const thread = toChatThread({
          session,
          context: bindingContext,
        })

        writeAudit(dependencies, config.stateDatabasePath, {
          command: "chat.list_messages",
          status: "success",
          errorMessage: null,
          metadata: {
            threadId,
            messageCount: messages.length,
            degraded,
          },
        })

        const response: ChatMessagesResponse = {
          thread,
          messages: messages.map(toChatMessage),
          degraded,
        }

        if (degradedMessage) {
          response.message = degradedMessage
        }

        return response
      } catch (error) {
        writeAudit(dependencies, config.stateDatabasePath, {
          command: "chat.list_messages",
          status: "failed",
          errorMessage: error instanceof Error ? error.message : "unknown_error",
          metadata: {
            threadId,
          },
        })

        throw error
      }
    },
    sendMessage: async (threadId: string, text: string): Promise<{ reply: ChatMessage | null }> => {
      const config = await dependencies.resolveConfig()
      const chatClient = dependencies.createOpencodeChatClient({ baseUrl: config.opencodeApiUrl })
      const promptResolution = await resolveInteractivePromptForSurface(dependencies)

      try {
        const reply = await chatClient.promptSession(
          threadId,
          text,
          promptResolution.systemPrompt
            ? { systemPrompt: promptResolution.systemPrompt }
            : undefined
        )

        writeAudit(dependencies, config.stateDatabasePath, {
          command: "chat.send_message",
          status: "success",
          errorMessage: null,
          metadata: {
            threadId,
            sentChars: text.length,
            hasReply: reply !== null,
            promptResolutionStatus: promptResolution.status,
          },
        })

        return {
          reply: reply ? toChatMessage(reply) : null,
        }
      } catch (error) {
        writeAudit(dependencies, config.stateDatabasePath, {
          command: "chat.send_message",
          status: "failed",
          errorMessage: error instanceof Error ? error.message : "unknown_error",
          metadata: {
            threadId,
            sentChars: text.length,
            promptResolutionStatus: promptResolution.status,
          },
        })

        throw error
      }
    },
    sendMessageStream: async function* (
      threadId: string,
      text: string
    ): AsyncGenerator<ChatStreamEvent> {
      const config = await dependencies.resolveConfig()
      const chatClient = dependencies.createOpencodeChatClient({ baseUrl: config.opencodeApiUrl })
      const startedAt = (dependencies.now ?? Date.now)()
      const requestMessageId = `cp-${startedAt}-${Math.random().toString(36).slice(2, 10)}`
      const promptResolution = await resolveInteractivePromptForSurface(dependencies)

      const abortController = new AbortController()
      const textParts = new Map<string, string>()
      const reasoningParts = new Map<string, string>()
      const toolParts = new Map<string, string>()
      const partTypesById = new Map<string, string>()
      const seenPartTypes = new Set<string>()
      const inspectedMessageRoles = new Map<string, OpencodeMessage["role"]>()
      let assistantMessageId: string | null = null
      let lastText = ""

      const buildCombinedText = (): string => {
        const textContent = [...textParts.values()].join("")
        const reasoningContent = [...reasoningParts.values()]
          .filter((entry) => entry.trim().length > 0)
          .map((entry) => `Reasoning: ${entry.trim()}`)
        const toolContent = [...toolParts.values()]
          .filter((entry) => entry.trim().length > 0)
          .map((entry) => `Tool: ${entry.trim()}`)

        return [...(textContent ? [textContent] : []), ...reasoningContent, ...toolContent]
          .join("\n")
          .trim()
      }

      const emitDelta = (): ChatStreamEvent | null => {
        const combined = buildCombinedText()
        const delta = combined.startsWith(lastText) ? combined.slice(lastText.length) : combined
        lastText = combined

        if (!assistantMessageId) {
          return null
        }

        return {
          type: "delta",
          messageId: assistantMessageId,
          delta,
          text: combined,
          partTypes: [...seenPartTypes],
        }
      }

      const resolveMessageRole = async (messageId: string): Promise<OpencodeMessage["role"]> => {
        const cachedRole = inspectedMessageRoles.get(messageId)
        if (cachedRole) {
          return cachedRole
        }

        try {
          const resolved = await chatClient.getMessage(threadId, messageId)
          const role = resolved?.message.role ?? "unknown"
          if (role !== "unknown") {
            inspectedMessageRoles.set(messageId, role)
          }

          return role
        } catch {
          return "unknown"
        }
      }

      const ensureAssistantMessage = async (messageId: string): Promise<boolean> => {
        if (assistantMessageId) {
          return messageId === assistantMessageId
        }

        const role = await resolveMessageRole(messageId)
        if (role !== "assistant") {
          return false
        }

        assistantMessageId = messageId
        return true
      }

      try {
        yield {
          type: "started",
          messageId: requestMessageId,
          createdAt: startedAt,
        }

        const eventIterator = chatClient
          .subscribeEvents(abortController.signal)
          [Symbol.asyncIterator]()
        const nextEventWithTimeout = async (): Promise<IteratorResult<OpencodeChatEvent>> => {
          const timeoutMs = 45_000
          let timer: ReturnType<typeof setTimeout> | null = null

          try {
            return await Promise.race([
              eventIterator.next(),
              new Promise<IteratorResult<OpencodeChatEvent>>((_, reject) => {
                timer = setTimeout(() => {
                  reject(new OpencodeChatApiError("Timed out while waiting for stream events"))
                }, timeoutMs)
              }),
            ])
          } finally {
            if (timer) {
              clearTimeout(timer)
            }
          }
        }

        const firstEventPromise = nextEventWithTimeout()
        await chatClient.promptSessionAsync(
          threadId,
          text,
          undefined,
          promptResolution.systemPrompt
            ? { systemPrompt: promptResolution.systemPrompt }
            : undefined
        )

        let firstEventPending = true
        while (true) {
          const step = firstEventPending ? await firstEventPromise : await nextEventWithTimeout()
          firstEventPending = false

          if (step.done) {
            break
          }

          const event = step.value
          const eventSessionId = resolveEventSessionId(event)
          if (eventSessionId && eventSessionId !== threadId) {
            continue
          }

          const eventAssistantMessageId = resolveAssistantMessageIdFromEvent(event)
          if (!assistantMessageId && eventAssistantMessageId) {
            assistantMessageId = eventAssistantMessageId
            inspectedMessageRoles.set(eventAssistantMessageId, "assistant")
          }

          if (event.type === "session.error") {
            const error = isRecord(event.properties.error) ? event.properties.error : null
            const errorData = error && isRecord(error.data) ? error.data : null
            const errorMessage =
              typeof errorData?.message === "string"
                ? errorData.message
                : "Streaming response failed"
            throw new OpencodeChatApiError(errorMessage)
          }

          if (event.type === "message.part.delta") {
            const partMessageId =
              typeof event.properties.messageID === "string" &&
              event.properties.messageID.length > 0
                ? event.properties.messageID
                : null
            const partId =
              typeof event.properties.partID === "string" && event.properties.partID.length > 0
                ? event.properties.partID
                : null
            const field =
              typeof event.properties.field === "string" && event.properties.field.length > 0
                ? event.properties.field
                : null
            const delta = typeof event.properties.delta === "string" ? event.properties.delta : ""

            if (!partMessageId || !partId || !field || delta.length === 0) {
              continue
            }

            if (!(await ensureAssistantMessage(partMessageId))) {
              continue
            }

            const partType = partTypesById.get(partId) ?? (field === "text" ? "text" : null)

            if (!partType) {
              continue
            }

            seenPartTypes.add(partType)

            if (partType === "text") {
              const existing = textParts.get(partId) ?? ""
              textParts.set(partId, `${existing}${delta}`)
            }

            if (partType === "reasoning") {
              const existing = reasoningParts.get(partId) ?? ""
              reasoningParts.set(partId, `${existing}${delta}`)
            }

            const update = emitDelta()
            if (update) {
              yield update
            }

            continue
          }

          if (event.type === "message.part.updated") {
            const part = isRecord(event.properties.part) ? event.properties.part : null
            if (!part || typeof part.type !== "string" || typeof part.id !== "string") {
              continue
            }

            const partMessageId =
              typeof part.messageID === "string" && part.messageID.length > 0
                ? part.messageID
                : null
            if (!partMessageId) {
              continue
            }

            partTypesById.set(part.id, part.type)

            if (!(await ensureAssistantMessage(partMessageId))) {
              continue
            }

            const delta = typeof event.properties.delta === "string" ? event.properties.delta : ""
            const type = part.type
            seenPartTypes.add(type)

            if (type === "text") {
              const existing = textParts.get(part.id) ?? ""
              const next =
                delta.length > 0
                  ? `${existing}${delta}`
                  : typeof part.text === "string"
                    ? part.text
                    : existing
              textParts.set(part.id, next)
            }

            if (type === "reasoning") {
              const existing = reasoningParts.get(part.id) ?? ""
              const next =
                delta.length > 0
                  ? `${existing}${delta}`
                  : typeof part.text === "string"
                    ? part.text
                    : existing
              reasoningParts.set(part.id, next)
            }

            if (type === "tool") {
              const state = isRecord(part.state) ? part.state : null
              const output = typeof state?.output === "string" ? state.output : ""
              if (output.length > 0) {
                toolParts.set(part.id, output)
              }
            }

            const update = emitDelta()
            if (update) {
              yield update
            }
          }

          if (event.type === "session.idle") {
            break
          }
        }

        abortController.abort()

        let reply: ChatMessage | null = null
        if (assistantMessageId) {
          const resolved = await chatClient.getMessage(threadId, assistantMessageId)
          reply = resolved?.message ? toChatMessage(resolved.message) : null
        }

        if (!reply) {
          const latest = await chatClient.listMessages(threadId)
          const candidate =
            [...latest]
              .reverse()
              .find(
                (message) => message.role === "assistant" && message.createdAt >= startedAt - 1_000
              ) ?? null
          reply = candidate ? toChatMessage(candidate) : null
        }

        writeAudit(dependencies, config.stateDatabasePath, {
          command: "chat.send_message_stream",
          status: "success",
          errorMessage: null,
          metadata: {
            threadId,
            sentChars: text.length,
            streamedChars: lastText.length,
            hasReply: reply !== null,
            promptResolutionStatus: promptResolution.status,
          },
        })

        yield {
          type: "completed",
          reply,
        }
      } catch (error) {
        abortController.abort()

        const message = error instanceof Error ? error.message : "Could not stream message"

        writeAudit(dependencies, config.stateDatabasePath, {
          command: "chat.send_message_stream",
          status: "failed",
          errorMessage: message,
          metadata: {
            threadId,
            sentChars: text.length,
            streamedChars: lastText.length,
            promptResolutionStatus: promptResolution.status,
          },
        })

        yield {
          type: "error",
          message,
        }
      }
    },
  }
}

export { OpencodeChatApiError }
