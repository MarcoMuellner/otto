import { describe, expect, it } from "vitest"

import {
  createApiChatThreadsAction,
  createApiChatThreadsLoader,
} from "../../app/server/api-chat-threads-route.server.js"

describe("api.chat.threads loader", () => {
  it("returns thread list payload", async () => {
    // Arrange
    const loader = createApiChatThreadsLoader({
      listThreads: async () => {
        return {
          threads: [
            {
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
          ],
          degraded: false,
        }
      },
      createThread: async () => {
        throw new Error("unused in loader test")
      },
    })

    // Act
    const response = await loader()

    // Assert
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      threads: [{ id: "session-1" }],
      degraded: false,
    })
  })
})

describe("api.chat.threads action", () => {
  it("creates thread via POST", async () => {
    // Arrange
    const action = createApiChatThreadsAction({
      listThreads: async () => {
        throw new Error("unused in action test")
      },
      createThread: async (title) => {
        expect(title).toBeUndefined()

        return {
          id: "session-2",
          title: "Session session",
          updatedAt: 2_000,
          isBound: false,
          isStale: false,
          bindings: [],
        }
      },
    })

    // Act
    const response = await action({
      request: new Request("http://localhost/api/chat/threads", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    })

    // Assert
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({
      thread: { id: "session-2" },
    })
  })

  it("rejects unsupported methods", async () => {
    // Arrange
    const action = createApiChatThreadsAction({
      listThreads: async () => {
        throw new Error("unused")
      },
      createThread: async () => {
        throw new Error("unused")
      },
    })

    // Act
    const response = await action({
      request: new Request("http://localhost/api/chat/threads", {
        method: "GET",
      }),
    })

    // Assert
    expect(response.status).toBe(405)
  })
})
