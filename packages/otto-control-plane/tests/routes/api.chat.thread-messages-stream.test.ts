import { describe, expect, it } from "vitest"

import { createApiChatThreadMessageStreamAction } from "../../app/server/api-chat-thread-message-stream-route.server.js"

describe("api.chat.thread-messages-stream action", () => {
  it("streams NDJSON events for POST", async () => {
    // Arrange
    const action = createApiChatThreadMessageStreamAction({
      sendMessageStream: async function* (threadId, text) {
        expect(threadId).toBe("session-1")
        expect(text).toBe("hello")

        yield {
          type: "started",
          messageId: "msg-1",
          createdAt: 1_000,
        }

        yield {
          type: "delta",
          messageId: "msg-1",
          delta: "hi",
          text: "hi",
          partTypes: ["text"],
        }

        yield {
          type: "completed",
          reply: {
            id: "msg-1",
            role: "assistant",
            text: "hi",
            createdAt: 1_000,
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
      request: new Request("http://localhost/api/chat/threads/session-1/messages/stream", {
        method: "POST",
        body: JSON.stringify({ text: "hello" }),
      }),
    })

    // Assert
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("application/x-ndjson")

    const lines = (await response.text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { type: string })

    expect(lines.map((line) => line.type)).toEqual(["started", "delta", "completed"])
  })

  it("rejects unsupported methods", async () => {
    // Arrange
    const action = createApiChatThreadMessageStreamAction({
      sendMessageStream: async function* () {
        yield* []
        throw new Error("unused")
      },
    })

    // Act
    const response = await action({
      params: {
        threadId: "session-1",
      },
      request: new Request("http://localhost/api/chat/threads/session-1/messages/stream", {
        method: "GET",
      }),
    })

    // Assert
    expect(response.status).toBe(405)
  })
})
