import { describe, expect, it, vi } from "vitest"

import { createChatSurfaceService } from "../../app/server/chat-surface.server.js"

describe("createChatSurfaceService", () => {
  it("returns degraded threads payload when bindings cannot be read", async () => {
    // Arrange
    const service = createChatSurfaceService({
      resolveConfig: async () => ({
        opencodeApiUrl: "http://127.0.0.1:4096",
        stateDatabasePath: "/tmp/otto-state.db",
      }),
      listSessionBindings: () => {
        throw new Error("database unavailable")
      },
      listRecentInteractiveContextEventsBySourceSessionId: () => [],
      insertCommandAudit: () => true,
      createOpencodeChatClient: () => ({
        listSessions: async () => [],
        getSession: async () => {
          throw new Error("unused in this test")
        },
        createSession: async () => {
          throw new Error("unused in this test")
        },
        listMessages: async () => {
          throw new Error("unused in this test")
        },
        getMessage: async () => {
          throw new Error("unused in this test")
        },
        promptSession: async () => {
          throw new Error("unused in this test")
        },
        promptSessionAsync: async () => {
          throw new Error("unused in this test")
        },
        subscribeEvents: async function* () {
          yield* []
          throw new Error("unused in this test")
        },
      }),
      now: () => 123,
    })

    // Act
    const payload = await service.listThreads()

    // Assert
    expect(payload).toMatchObject({
      threads: [],
      degraded: true,
      message: "Could not load persisted session bindings",
    })
  })

  it("keeps message reads available and marks degraded when bindings fail", async () => {
    // Arrange
    const service = createChatSurfaceService({
      resolveConfig: async () => ({
        opencodeApiUrl: "http://127.0.0.1:4096",
        stateDatabasePath: "/tmp/otto-state.db",
      }),
      listSessionBindings: () => {
        throw new Error("database unavailable")
      },
      listRecentInteractiveContextEventsBySourceSessionId: () => [],
      insertCommandAudit: () => true,
      createOpencodeChatClient: () => ({
        listSessions: async () => {
          throw new Error("unused in this test")
        },
        getSession: async () => ({
          id: "session-1",
          title: "Operator chat",
          createdAt: 1_000,
          updatedAt: 2_000,
        }),
        createSession: async () => {
          throw new Error("unused in this test")
        },
        listMessages: async () => [
          {
            id: "m-1",
            role: "assistant",
            text: "hello",
            createdAt: 1_500,
            partTypes: ["text"],
          },
        ],
        getMessage: async () => {
          throw new Error("unused in this test")
        },
        promptSession: async () => {
          throw new Error("unused in this test")
        },
        promptSessionAsync: async () => {
          throw new Error("unused in this test")
        },
        subscribeEvents: async function* () {
          yield* []
          throw new Error("unused in this test")
        },
      }),
      now: () => 123,
    })

    // Act
    const payload = await service.listMessages("session-1")

    // Assert
    expect(payload).toMatchObject({
      thread: {
        id: "session-1",
      },
      messages: [{ id: "m-1" }],
      degraded: true,
      message: "Could not load persisted session bindings",
    })
  })

  it("injects resolved interactive system prompt when sending a message", async () => {
    // Arrange
    const promptSession = vi.fn(async () => {
      return {
        id: "reply-1",
        role: "assistant" as const,
        text: "done",
        createdAt: 2_000,
        partTypes: ["text"],
      }
    })

    const service = createChatSurfaceService({
      resolveConfig: async () => ({
        opencodeApiUrl: "http://127.0.0.1:4096",
        stateDatabasePath: "/tmp/otto-state.db",
      }),
      listSessionBindings: () => [],
      listRecentInteractiveContextEventsBySourceSessionId: () => [],
      insertCommandAudit: () => true,
      resolveInteractiveSystemPrompt: async () => "# Prompt\nUse web layering.",
      createOpencodeChatClient: () => ({
        listSessions: async () => [],
        getSession: async () => {
          throw new Error("unused in this test")
        },
        createSession: async () => {
          throw new Error("unused in this test")
        },
        listMessages: async () => {
          throw new Error("unused in this test")
        },
        getMessage: async () => {
          throw new Error("unused in this test")
        },
        promptSession,
        promptSessionAsync: async () => {
          throw new Error("unused in this test")
        },
        subscribeEvents: async function* () {
          yield* []
          throw new Error("unused in this test")
        },
      }),
      now: () => 1_000,
    })

    // Act
    const payload = await service.sendMessage("session-1", "hello")

    // Assert
    expect(payload.reply?.id).toBe("reply-1")
    expect(promptSession).toHaveBeenCalledWith("session-1", "hello", {
      systemPrompt: "# Prompt\nUse web layering.",
    })
  })

  it("continues sending messages when prompt resolution fails", async () => {
    // Arrange
    const promptSession = vi.fn(async () => {
      return {
        id: "reply-2",
        role: "assistant" as const,
        text: "fallback",
        createdAt: 2_100,
        partTypes: ["text"],
      }
    })

    const service = createChatSurfaceService({
      resolveConfig: async () => ({
        opencodeApiUrl: "http://127.0.0.1:4096",
        stateDatabasePath: "/tmp/otto-state.db",
      }),
      listSessionBindings: () => [],
      listRecentInteractiveContextEventsBySourceSessionId: () => [],
      insertCommandAudit: () => true,
      resolveInteractiveSystemPrompt: async () => {
        throw new Error("runtime endpoint unavailable")
      },
      createOpencodeChatClient: () => ({
        listSessions: async () => [],
        getSession: async () => {
          throw new Error("unused in this test")
        },
        createSession: async () => {
          throw new Error("unused in this test")
        },
        listMessages: async () => {
          throw new Error("unused in this test")
        },
        getMessage: async () => {
          throw new Error("unused in this test")
        },
        promptSession,
        promptSessionAsync: async () => {
          throw new Error("unused in this test")
        },
        subscribeEvents: async function* () {
          yield* []
          throw new Error("unused in this test")
        },
      }),
      now: () => 1_100,
    })

    // Act
    const payload = await service.sendMessage("session-1", "hello")

    // Assert
    expect(payload.reply?.id).toBe("reply-2")
    expect(promptSession).toHaveBeenCalledWith("session-1", "hello", undefined)
  })

  it("treats blank resolved prompts as empty and avoids prompt injection", async () => {
    // Arrange
    const promptSession = vi.fn(async () => {
      return {
        id: "reply-blank",
        role: "assistant" as const,
        text: "fallback",
        createdAt: 2_100,
        partTypes: ["text"],
      }
    })
    const insertCommandAudit = vi.fn(() => true)

    const service = createChatSurfaceService({
      resolveConfig: async () => ({
        opencodeApiUrl: "http://127.0.0.1:4096",
        stateDatabasePath: "/tmp/otto-state.db",
      }),
      listSessionBindings: () => [],
      listRecentInteractiveContextEventsBySourceSessionId: () => [],
      insertCommandAudit,
      resolveInteractiveSystemPrompt: async () => "   ",
      createOpencodeChatClient: () => ({
        listSessions: async () => [],
        getSession: async () => {
          throw new Error("unused in this test")
        },
        createSession: async () => {
          throw new Error("unused in this test")
        },
        listMessages: async () => {
          throw new Error("unused in this test")
        },
        getMessage: async () => {
          throw new Error("unused in this test")
        },
        promptSession,
        promptSessionAsync: async () => {
          throw new Error("unused in this test")
        },
        subscribeEvents: async function* () {
          yield* []
          throw new Error("unused in this test")
        },
      }),
      now: () => 1_200,
    })

    // Act
    const payload = await service.sendMessage("session-1", "hello")

    // Assert
    expect(payload.reply?.id).toBe("reply-blank")
    expect(promptSession).toHaveBeenCalledWith("session-1", "hello", undefined)
    expect(insertCommandAudit).toHaveBeenLastCalledWith(
      "/tmp/otto-state.db",
      expect.objectContaining({
        metadata: expect.objectContaining({
          promptResolutionStatus: "empty",
        }),
      })
    )
  })

  it("falls back when prompt resolution times out", async () => {
    // Arrange
    vi.useFakeTimers()

    try {
      const promptSession = vi.fn(async () => {
        return {
          id: "reply-timeout",
          role: "assistant" as const,
          text: "fallback",
          createdAt: 2_200,
          partTypes: ["text"],
        }
      })
      const insertCommandAudit = vi.fn(() => true)

      const service = createChatSurfaceService({
        resolveConfig: async () => ({
          opencodeApiUrl: "http://127.0.0.1:4096",
          stateDatabasePath: "/tmp/otto-state.db",
        }),
        listSessionBindings: () => [],
        listRecentInteractiveContextEventsBySourceSessionId: () => [],
        insertCommandAudit,
        resolveInteractiveSystemPrompt: async () => {
          await new Promise(() => {})
          return "# never"
        },
        createOpencodeChatClient: () => ({
          listSessions: async () => [],
          getSession: async () => {
            throw new Error("unused in this test")
          },
          createSession: async () => {
            throw new Error("unused in this test")
          },
          listMessages: async () => {
            throw new Error("unused in this test")
          },
          getMessage: async () => {
            throw new Error("unused in this test")
          },
          promptSession,
          promptSessionAsync: async () => {
            throw new Error("unused in this test")
          },
          subscribeEvents: async function* () {
            yield* []
            throw new Error("unused in this test")
          },
        }),
        now: () => 1_300,
      })

      // Act
      const payloadPromise = service.sendMessage("session-1", "hello")
      await vi.advanceTimersByTimeAsync(2_000)
      const payload = await payloadPromise

      // Assert
      expect(payload.reply?.id).toBe("reply-timeout")
      expect(promptSession).toHaveBeenCalledWith("session-1", "hello", undefined)
      expect(insertCommandAudit).toHaveBeenLastCalledWith(
        "/tmp/otto-state.db",
        expect.objectContaining({
          metadata: expect.objectContaining({
            promptResolutionStatus: "fallback",
          }),
        })
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it("injects recent non-interactive context into sync send model input", async () => {
    // Arrange
    const promptSession = vi.fn(async () => {
      return {
        id: "reply-context",
        role: "assistant" as const,
        text: "contextual reply",
        createdAt: 2_300,
        partTypes: ["text"],
      }
    })
    const insertCommandAudit = vi.fn(() => true)
    const listRecentInteractiveContextEventsBySourceSessionId = vi.fn(() => [
      {
        sourceLane: "scheduler",
        sourceKind: "heartbeat",
        sourceRef: "job-1",
        content: "Heartbeat digest delivered",
        deliveryStatus: "sent" as const,
        deliveryStatusDetail: "delivered",
        errorMessage: null,
        createdAt: 1,
      },
    ])

    const service = createChatSurfaceService({
      resolveConfig: async () => ({
        opencodeApiUrl: "http://127.0.0.1:4096",
        stateDatabasePath: "/tmp/otto-state.db",
      }),
      listSessionBindings: () => [],
      listRecentInteractiveContextEventsBySourceSessionId,
      insertCommandAudit,
      resolveInteractiveSystemPrompt: async () => "# Prompt\nUse web layering.",
      createOpencodeChatClient: () => ({
        listSessions: async () => [],
        getSession: async () => {
          throw new Error("unused in this test")
        },
        createSession: async () => {
          throw new Error("unused in this test")
        },
        listMessages: async () => {
          throw new Error("unused in this test")
        },
        getMessage: async () => {
          throw new Error("unused in this test")
        },
        promptSession,
        promptSessionAsync: async () => {
          throw new Error("unused in this test")
        },
        subscribeEvents: async function* () {
          yield* []
          throw new Error("unused in this test")
        },
      }),
      now: () => 1_500,
    })

    // Act
    const payload = await service.sendMessage("session-1", "hello")

    // Assert
    expect(payload.reply?.id).toBe("reply-context")
    expect(listRecentInteractiveContextEventsBySourceSessionId).toHaveBeenCalledWith(
      "/tmp/otto-state.db",
      "session-1",
      20
    )
    expect(promptSession).toHaveBeenCalledWith(
      "session-1",
      expect.stringContaining("Recent non-interactive context:"),
      { systemPrompt: "# Prompt\nUse web layering." }
    )
    expect(insertCommandAudit).toHaveBeenLastCalledWith(
      "/tmp/otto-state.db",
      expect.objectContaining({
        metadata: expect.objectContaining({
          contextInjectionStatus: "injected",
          contextEventCount: 1,
          contextInjectedEventCount: 1,
        }),
      })
    )
  })

  it("continues sync send without context injection when state DB query fails", async () => {
    // Arrange
    const promptSession = vi.fn(async () => {
      return {
        id: "reply-context-degraded",
        role: "assistant" as const,
        text: "degraded reply",
        createdAt: 2_300,
        partTypes: ["text"],
      }
    })
    const insertCommandAudit = vi.fn(() => true)

    const service = createChatSurfaceService({
      resolveConfig: async () => ({
        opencodeApiUrl: "http://127.0.0.1:4096",
        stateDatabasePath: "/tmp/otto-state.db",
      }),
      listSessionBindings: () => [],
      listRecentInteractiveContextEventsBySourceSessionId: () => {
        throw new Error("state DB unavailable")
      },
      insertCommandAudit,
      resolveInteractiveSystemPrompt: async () => "# Prompt\nUse web layering.",
      createOpencodeChatClient: () => ({
        listSessions: async () => [],
        getSession: async () => {
          throw new Error("unused in this test")
        },
        createSession: async () => {
          throw new Error("unused in this test")
        },
        listMessages: async () => {
          throw new Error("unused in this test")
        },
        getMessage: async () => {
          throw new Error("unused in this test")
        },
        promptSession,
        promptSessionAsync: async () => {
          throw new Error("unused in this test")
        },
        subscribeEvents: async function* () {
          yield* []
          throw new Error("unused in this test")
        },
      }),
      now: () => 1_600,
    })

    // Act
    const payload = await service.sendMessage("session-1", "hello")

    // Assert
    expect(payload.reply?.id).toBe("reply-context-degraded")
    expect(promptSession).toHaveBeenCalledWith("session-1", "hello", {
      systemPrompt: "# Prompt\nUse web layering.",
    })
    expect(insertCommandAudit).toHaveBeenLastCalledWith(
      "/tmp/otto-state.db",
      expect.objectContaining({
        metadata: expect.objectContaining({
          contextInjectionStatus: "degraded",
          contextEventCount: 0,
          contextInjectedEventCount: 0,
        }),
      })
    )
  })

  it("injects recent non-interactive context into streaming model input", async () => {
    // Arrange
    const promptSessionAsync = vi.fn(async () => undefined)
    const listRecentInteractiveContextEventsBySourceSessionId = vi.fn(() => [
      {
        sourceLane: "scheduler",
        sourceKind: "heartbeat",
        sourceRef: "job-2",
        content: "Heartbeat queued",
        deliveryStatus: "queued" as const,
        deliveryStatusDetail: "retry_scheduled",
        errorMessage: null,
        createdAt: 1,
      },
    ])

    const service = createChatSurfaceService({
      resolveConfig: async () => ({
        opencodeApiUrl: "http://127.0.0.1:4096",
        stateDatabasePath: "/tmp/otto-state.db",
      }),
      listSessionBindings: () => [],
      listRecentInteractiveContextEventsBySourceSessionId,
      insertCommandAudit: () => true,
      createOpencodeChatClient: () => ({
        listSessions: async () => [],
        getSession: async () => {
          throw new Error("unused in this test")
        },
        createSession: async () => {
          throw new Error("unused in this test")
        },
        listMessages: async () => [
          {
            id: "assistant-ctx-stream",
            role: "assistant",
            text: "Hello world",
            createdAt: 2_000,
            partTypes: ["text"],
          },
        ],
        getMessage: async (_sessionId: string, messageId: string) => {
          if (messageId === "assistant-ctx-stream") {
            return {
              message: {
                id: "assistant-ctx-stream",
                role: "assistant",
                text: "Hello world",
                createdAt: 2_000,
                partTypes: ["text"],
              },
              parts: [],
            }
          }

          return null
        },
        promptSession: async () => {
          throw new Error("unused in this test")
        },
        promptSessionAsync,
        subscribeEvents: async function* () {
          yield {
            type: "message.updated",
            properties: {
              sessionID: "session-1",
              info: {
                id: "assistant-ctx-stream",
                role: "assistant",
              },
            },
          }

          yield {
            type: "message.part.updated",
            properties: {
              sessionID: "session-1",
              part: {
                id: "part-ctx-stream",
                messageID: "assistant-ctx-stream",
                type: "text",
                text: "Hello world",
              },
              delta: "Hello world",
            },
          }

          yield {
            type: "session.idle",
            properties: {
              sessionID: "session-1",
            },
          }
        },
      }),
      now: () => 1_700,
    })

    // Act
    const events: Array<{ type: string }> = []
    for await (const event of service.sendMessageStream("session-1", "hello")) {
      events.push({ type: event.type })
    }

    // Assert
    expect(events.map((entry) => entry.type)).toEqual(["started", "delta", "completed"])
    expect(promptSessionAsync).toHaveBeenCalledWith(
      "session-1",
      expect.stringContaining("Recent non-interactive context:"),
      undefined,
      undefined
    )
  })

  it("streams assistant deltas and ignores user part events", async () => {
    // Arrange
    const service = createChatSurfaceService({
      resolveConfig: async () => ({
        opencodeApiUrl: "http://127.0.0.1:4096",
        stateDatabasePath: "/tmp/otto-state.db",
      }),
      listSessionBindings: () => [],
      listRecentInteractiveContextEventsBySourceSessionId: () => [],
      insertCommandAudit: () => true,
      createOpencodeChatClient: () => ({
        listSessions: async () => [],
        getSession: async () => {
          throw new Error("unused in this test")
        },
        createSession: async () => {
          throw new Error("unused in this test")
        },
        listMessages: async () => [
          {
            id: "assistant-1",
            role: "assistant",
            text: "Hello world",
            createdAt: 2_000,
            partTypes: ["text"],
          },
        ],
        getMessage: async (_sessionId: string, messageId: string) => {
          if (messageId === "assistant-1") {
            return {
              message: {
                id: "assistant-1",
                role: "assistant",
                text: "Hello world",
                createdAt: 2_000,
                partTypes: ["text"],
              },
              parts: [],
            }
          }

          return {
            message: {
              id: "user-1",
              role: "user",
              text: "hello",
              createdAt: 1_900,
              partTypes: ["text"],
            },
            parts: [],
          }
        },
        promptSession: async () => {
          throw new Error("unused in this test")
        },
        promptSessionAsync: async () => undefined,
        subscribeEvents: async function* () {
          yield {
            type: "message.part.updated",
            properties: {
              sessionID: "session-1",
              part: {
                id: "part-user-1",
                messageID: "user-1",
                type: "text",
                text: "hello",
              },
              delta: "hello",
            },
          }

          yield {
            type: "message.updated",
            properties: {
              sessionID: "session-1",
              info: {
                id: "assistant-1",
                role: "assistant",
              },
            },
          }

          yield {
            type: "message.part.updated",
            properties: {
              sessionID: "session-1",
              part: {
                id: "part-1",
                messageID: "assistant-1",
                type: "text",
                text: "Hello world",
              },
              delta: "Hello world",
            },
          }

          yield {
            type: "session.idle",
            properties: {
              sessionID: "session-1",
            },
          }
        },
      }),
      now: () => 1_000,
    })

    // Act
    const events: Array<{ type: string; text?: string }> = []
    for await (const event of service.sendMessageStream("session-1", "hello")) {
      if (event.type === "delta") {
        events.push({ type: event.type, text: event.text })
        continue
      }

      events.push({ type: event.type })
    }

    // Assert
    expect(events.map((event) => event.type)).toEqual(["started", "delta", "completed"])
    expect(events[1]).toMatchObject({
      type: "delta",
      text: "Hello world",
    })
  })

  it("streams assistant deltas when part updates arrive before message.updated", async () => {
    // Arrange
    const service = createChatSurfaceService({
      resolveConfig: async () => ({
        opencodeApiUrl: "http://127.0.0.1:4096",
        stateDatabasePath: "/tmp/otto-state.db",
      }),
      listSessionBindings: () => [],
      listRecentInteractiveContextEventsBySourceSessionId: () => [],
      insertCommandAudit: () => true,
      createOpencodeChatClient: () => ({
        listSessions: async () => [],
        getSession: async () => {
          throw new Error("unused in this test")
        },
        createSession: async () => {
          throw new Error("unused in this test")
        },
        listMessages: async () => [
          {
            id: "assistant-2",
            role: "assistant",
            text: "Streaming works",
            createdAt: 2_000,
            partTypes: ["text"],
          },
        ],
        getMessage: async (_sessionId: string, messageId: string) => {
          if (messageId === "assistant-2") {
            return {
              message: {
                id: "assistant-2",
                role: "assistant",
                text: "Streaming works",
                createdAt: 2_000,
                partTypes: ["text"],
              },
              parts: [],
            }
          }

          return {
            message: {
              id: "user-2",
              role: "user",
              text: "hello",
              createdAt: 1_900,
              partTypes: ["text"],
            },
            parts: [],
          }
        },
        promptSession: async () => {
          throw new Error("unused in this test")
        },
        promptSessionAsync: async () => undefined,
        subscribeEvents: async function* () {
          yield {
            type: "message.part.updated",
            properties: {
              sessionID: "session-1",
              part: {
                id: "part-2",
                messageID: "assistant-2",
                type: "text",
                text: "Streaming works",
              },
              delta: "Streaming works",
            },
          }

          yield {
            type: "message.updated",
            properties: {
              sessionID: "session-1",
              info: {
                id: "assistant-2",
                role: "assistant",
              },
            },
          }

          yield {
            type: "session.idle",
            properties: {
              sessionID: "session-1",
            },
          }
        },
      }),
      now: () => 1_000,
    })

    // Act
    const events: Array<{ type: string; text?: string }> = []
    for await (const event of service.sendMessageStream("session-1", "hello")) {
      if (event.type === "delta") {
        events.push({ type: event.type, text: event.text })
        continue
      }

      events.push({ type: event.type })
    }

    // Assert
    expect(events.map((event) => event.type)).toEqual(["started", "delta", "completed"])
    expect(events[1]).toMatchObject({
      type: "delta",
      text: "Streaming works",
    })
  })

  it("streams assistant deltas from message.part.delta events", async () => {
    // Arrange
    const service = createChatSurfaceService({
      resolveConfig: async () => ({
        opencodeApiUrl: "http://127.0.0.1:4096",
        stateDatabasePath: "/tmp/otto-state.db",
      }),
      listSessionBindings: () => [],
      listRecentInteractiveContextEventsBySourceSessionId: () => [],
      insertCommandAudit: () => true,
      createOpencodeChatClient: () => ({
        listSessions: async () => [],
        getSession: async () => {
          throw new Error("unused in this test")
        },
        createSession: async () => {
          throw new Error("unused in this test")
        },
        listMessages: async () => [
          {
            id: "assistant-3",
            role: "assistant",
            text: "Streaming from delta events",
            createdAt: 2_000,
            partTypes: ["text"],
          },
        ],
        getMessage: async (_sessionId: string, messageId: string) => {
          if (messageId === "assistant-3") {
            return {
              message: {
                id: "assistant-3",
                role: "assistant",
                text: "Streaming from delta events",
                createdAt: 2_000,
                partTypes: ["text"],
              },
              parts: [],
            }
          }

          return {
            message: {
              id: "user-3",
              role: "user",
              text: "hello",
              createdAt: 1_900,
              partTypes: ["text"],
            },
            parts: [],
          }
        },
        promptSession: async () => {
          throw new Error("unused in this test")
        },
        promptSessionAsync: async () => undefined,
        subscribeEvents: async function* () {
          yield {
            type: "message.part.delta",
            properties: {
              sessionID: "session-1",
              messageID: "user-3",
              partID: "part-user-3",
              field: "text",
              delta: "ignore",
            },
          }

          yield {
            type: "message.part.delta",
            properties: {
              sessionID: "session-1",
              messageID: "assistant-3",
              partID: "part-assistant-3",
              field: "text",
              delta: "Streaming ",
            },
          }

          yield {
            type: "message.part.delta",
            properties: {
              sessionID: "session-1",
              messageID: "assistant-3",
              partID: "part-assistant-3",
              field: "text",
              delta: "from delta events",
            },
          }

          yield {
            type: "session.idle",
            properties: {
              sessionID: "session-1",
            },
          }
        },
      }),
      now: () => 1_000,
    })

    // Act
    const events: Array<{ type: string; text?: string }> = []
    for await (const event of service.sendMessageStream("session-1", "hello")) {
      if (event.type === "delta") {
        events.push({ type: event.type, text: event.text })
        continue
      }

      events.push({ type: event.type })
    }

    // Assert
    expect(events.map((event) => event.type)).toEqual(["started", "delta", "delta", "completed"])
    expect(events[1]).toMatchObject({
      type: "delta",
      text: "Streaming",
    })
    expect(events[2]).toMatchObject({
      type: "delta",
      text: "Streaming from delta events",
    })
  })
})
