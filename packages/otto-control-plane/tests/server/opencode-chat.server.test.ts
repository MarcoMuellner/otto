import { describe, expect, it } from "vitest"

import {
  createOpencodeChatClient,
  OpencodeChatApiError,
} from "../../app/server/opencode-chat.server.js"

describe("createOpencodeChatClient", () => {
  it("maps SDK-like session list payload", async () => {
    // Arrange
    const client = createOpencodeChatClient({
      baseUrl: "http://127.0.0.1:4096",
      sessionApi: {
        list: async () => {
          return {
            data: [
              {
                id: "session-1",
                title: "Telegram chat",
                createdAt: 1_000,
                updatedAt: 2_000,
              },
            ],
          }
        },
      },
    })

    // Act
    const sessions = await client.listSessions()

    // Assert
    expect(sessions).toEqual([
      {
        id: "session-1",
        title: "Telegram chat",
        createdAt: 1_000,
        updatedAt: 2_000,
      },
    ])
  })

  it("maps session timestamps from time envelope", async () => {
    // Arrange
    const client = createOpencodeChatClient({
      baseUrl: "http://127.0.0.1:4096",
      fetchImpl: async () => {
        return Response.json(
          [
            {
              id: "session-time-1",
              title: "From time envelope",
              time: {
                created: 11,
                updated: 22,
              },
            },
          ],
          { status: 200 }
        )
      },
    })

    // Act
    const sessions = await client.listSessions()

    // Assert
    expect(sessions).toEqual([
      {
        id: "session-time-1",
        title: "From time envelope",
        createdAt: 11,
        updatedAt: 22,
      },
    ])
  })

  it("maps message list payload from info/parts envelopes", async () => {
    // Arrange
    const client = createOpencodeChatClient({
      baseUrl: "http://127.0.0.1:4096",
      sessionApi: {
        messages: async () => {
          return {
            data: [
              {
                info: {
                  id: "m-1",
                  role: "user",
                  createdAt: 1_000,
                },
                parts: [{ type: "text", text: "hello" }],
              },
              {
                info: {
                  id: "m-2",
                  role: "assistant",
                  createdAt: 2_000,
                },
                parts: [{ type: "text", text: "hi" }],
              },
            ],
          }
        },
      },
    })

    // Act
    const messages = await client.listMessages("session-1")

    // Assert
    expect(messages).toMatchObject([
      {
        id: "m-1",
        role: "user",
        text: "hello",
      },
      {
        id: "m-2",
        role: "assistant",
        text: "hi",
      },
    ])
  })

  it("uses chat fallback when prompt API is unavailable", async () => {
    // Arrange
    const client = createOpencodeChatClient({
      baseUrl: "http://127.0.0.1:4096",
      sessionApi: {
        chat: async () => {
          return {
            data: {
              info: {
                id: "m-3",
                role: "assistant",
                createdAt: 3_000,
              },
              parts: [{ type: "text", text: "fallback reply" }],
            },
          }
        },
      },
    })

    // Act
    const reply = await client.promptSession("session-1", "hello")

    // Assert
    expect(reply).toMatchObject({
      id: "m-3",
      role: "assistant",
      text: "fallback reply",
    })
  })

  it("throws OpencodeChatApiError when fallback HTTP endpoint fails", async () => {
    // Arrange
    const client = createOpencodeChatClient({
      baseUrl: "http://127.0.0.1:4096",
      fetchImpl: async () => {
        return Response.json({ error: "not_found" }, { status: 404 })
      },
      sessionApi: {},
    })

    // Act + Assert
    await expect(client.listSessions()).rejects.toBeInstanceOf(OpencodeChatApiError)
  })
})
