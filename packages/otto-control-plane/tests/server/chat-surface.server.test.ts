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
        promptSession: async () => {
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
        promptSession: async () => {
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
})
