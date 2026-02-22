import { describe, expect, it } from "vitest"

import {
  createApiChatThreadMessagesAction,
  createApiChatThreadMessagesLoader,
} from "../../app/server/api-chat-thread-messages-route.server.js"

describe("api.chat.thread-messages loader", () => {
  it("returns message payload", async () => {
    // Arrange
    const loader = createApiChatThreadMessagesLoader({
      listMessages: async (threadId) => {
        expect(threadId).toBe("session-1")
        return {
          thread: {
            id: "session-1",
            title: "Telegram chat",
            updatedAt: 1_000,
            isBound: true,
            isStale: false,
            bindings: [
              {
                key: "telegram:chat:123:assistant",
                source: "telegram",
                label: "Telegram chat 123",
              },
            ],
          },
          messages: [
            {
              id: "m-1",
              role: "user",
              text: "hello",
              createdAt: 1_000,
              partTypes: ["text"],
            },
          ],
          degraded: false,
        }
      },
      sendMessage: async () => {
        throw new Error("unused in loader test")
      },
    })

    // Act
    const response = await loader({
      params: {
        threadId: "session-1",
      },
    })

    // Assert
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      thread: { id: "session-1" },
      messages: [{ id: "m-1" }],
    })
  })
})

describe("api.chat.thread-messages action", () => {
  it("sends message via POST", async () => {
    // Arrange
    const action = createApiChatThreadMessagesAction({
      listMessages: async () => {
        throw new Error("unused in action test")
      },
      sendMessage: async (threadId, text) => {
        expect(threadId).toBe("session-1")
        expect(text).toBe("hello")
        return {
          reply: {
            id: "m-2",
            role: "assistant",
            text: "hi",
            createdAt: 2_000,
            partTypes: ["text"],
          },
        }
      },
    })

    // Act
    const response = await action({
      params: {
        threadId: "session-1",
      },
      request: new Request("http://localhost/api/chat/threads/session-1/messages", {
        method: "POST",
        body: JSON.stringify({ text: "hello" }),
      }),
    })

    // Assert
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      reply: { id: "m-2" },
    })
  })

  it("rejects unsupported methods", async () => {
    // Arrange
    const action = createApiChatThreadMessagesAction({
      listMessages: async () => {
        throw new Error("unused")
      },
      sendMessage: async () => {
        throw new Error("unused")
      },
    })

    // Act
    const response = await action({
      params: {
        threadId: "session-1",
      },
      request: new Request("http://localhost/api/chat/threads/session-1/messages", {
        method: "GET",
      }),
    })

    // Assert
    expect(response.status).toBe(405)
  })
})
