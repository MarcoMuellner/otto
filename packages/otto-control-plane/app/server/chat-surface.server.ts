import type {
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
  type OpencodeMessage,
  type OpencodeSessionSummary,
} from "./opencode-chat.server.js"

type ChatSurfaceServiceDependencies = {
  resolveConfig: typeof resolveCachedControlPlaneChatConfig
  listSessionBindings: typeof listSessionBindings
  insertCommandAudit: typeof insertCommandAudit
  createOpencodeChatClient: typeof createOpencodeChatClient
  now?: () => number
}

const defaultDependencies: ChatSurfaceServiceDependencies = {
  resolveConfig: resolveCachedControlPlaneChatConfig,
  listSessionBindings,
  insertCommandAudit,
  createOpencodeChatClient,
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

      return {
        threads,
        degraded,
        ...(degradedMessage ? { message: degradedMessage } : {}),
      }
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

        return {
          thread,
          messages: messages.map(toChatMessage),
          degraded,
          ...(degradedMessage ? { message: degradedMessage } : {}),
        }
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

      try {
        const reply = await chatClient.promptSession(threadId, text)

        writeAudit(dependencies, config.stateDatabasePath, {
          command: "chat.send_message",
          status: "success",
          errorMessage: null,
          metadata: {
            threadId,
            sentChars: text.length,
            hasReply: reply !== null,
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
          },
        })

        throw error
      }
    },
  }
}

export { OpencodeChatApiError }
