import { describe, expect, it } from "vitest"

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

  it("streams assistant deltas and ignores user part events", async () => {
    // Arrange
    const service = createChatSurfaceService({
      resolveConfig: async () => ({
        opencodeApiUrl: "http://127.0.0.1:4096",
        stateDatabasePath: "/tmp/otto-state.db",
      }),
      listSessionBindings: () => [],
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
