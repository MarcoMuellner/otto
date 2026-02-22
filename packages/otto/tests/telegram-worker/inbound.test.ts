import { describe, expect, it, vi } from "vitest"
import type { Logger } from "pino"

import { createInboundBridge } from "../../src/telegram-worker/inbound.js"

describe("createInboundBridge", () => {
  it("reuses bound session and sends assistant reply", async () => {
    // Arrange
    const logger = {
      info: vi.fn(),
      error: vi.fn(),
    } as unknown as Logger
    const sendMessage = vi.fn(async () => {})
    const sessionGateway = {
      ensureSession: vi.fn(async () => "session-1"),
      promptSessionParts: vi.fn(async () => "Hello from Otto"),
      promptSession: vi.fn(async () => "Hello from Otto"),
    }
    const sessionBindingsRepository = {
      getByBindingKey: vi.fn(() => ({ sessionId: "session-1" })),
      upsert: vi.fn(),
    }
    const inboundMessagesRepository = {
      insert: vi.fn(),
    }
    const outboundMessagesRepository = {
      enqueue: vi.fn(),
    }

    const bridge = createInboundBridge({
      logger,
      sender: { sendMessage },
      sessionGateway,
      sessionBindingsRepository,
      inboundMessagesRepository,
      outboundMessagesRepository,
      promptTimeoutMs: 30_000,
    })

    // Act
    await bridge.handleTextMessage({
      sourceMessageId: "42",
      chatId: 7,
      userId: 9,
      text: "hi",
    })

    // Assert
    expect(sessionGateway.ensureSession).toHaveBeenCalledWith("session-1")
    expect(sessionGateway.promptSessionParts).toHaveBeenCalledWith(
      "session-1",
      [{ type: "text", text: "hi" }],
      {
        modelContext: {
          flow: "interactiveAssistant",
        },
      }
    )
    expect(sendMessage).toHaveBeenCalledWith(7, "Hello from Otto")
    expect(inboundMessagesRepository.insert).toHaveBeenCalledOnce()
    expect(outboundMessagesRepository.enqueue).toHaveBeenCalledOnce()
  })

  it("ignores duplicate inbound messages without prompting", async () => {
    // Arrange
    const logger = {
      info: vi.fn(),
      error: vi.fn(),
    } as unknown as Logger
    const sendMessage = vi.fn(async () => {})
    const sessionGateway = {
      ensureSession: vi.fn(async () => "session-1"),
      promptSessionParts: vi.fn(async () => "Hello"),
      promptSession: vi.fn(async () => "Hello"),
    }
    const sessionBindingsRepository = {
      getByBindingKey: vi.fn(() => ({ sessionId: "session-1" })),
      upsert: vi.fn(),
    }
    const inboundMessagesRepository = {
      insert: vi.fn(() => {
        throw new Error("UNIQUE constraint failed: messages_in.source_message_id")
      }),
    }
    const outboundMessagesRepository = {
      enqueue: vi.fn(),
    }

    const bridge = createInboundBridge({
      logger,
      sender: { sendMessage },
      sessionGateway,
      sessionBindingsRepository,
      inboundMessagesRepository,
      outboundMessagesRepository,
      promptTimeoutMs: 30_000,
    })

    // Act
    await bridge.handleTextMessage({
      sourceMessageId: "dup",
      chatId: 7,
      userId: 9,
      text: "hi",
    })

    // Assert
    expect(sessionGateway.promptSessionParts).not.toHaveBeenCalled()
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it("sends Telegram typing action while waiting for assistant reply", async () => {
    // Arrange
    let resolvePrompt: (value: string) => void = () => {
      throw new Error("Prompt resolver was not initialized")
    }
    const pendingPrompt = new Promise<string>((resolve) => {
      resolvePrompt = resolve
    })

    const logger = {
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as unknown as Logger
    const sendMessage = vi.fn(async () => {})
    const sendChatAction = vi.fn(async () => {})
    const sessionGateway = {
      ensureSession: vi.fn(async () => "session-1"),
      promptSessionParts: vi.fn(async () => await pendingPrompt),
      promptSession: vi.fn(async () => await pendingPrompt),
    }
    const sessionBindingsRepository = {
      getByBindingKey: vi.fn(() => ({ sessionId: "session-1" })),
      upsert: vi.fn(),
    }
    const inboundMessagesRepository = {
      insert: vi.fn(),
    }
    const outboundMessagesRepository = {
      enqueue: vi.fn(),
    }

    const bridge = createInboundBridge({
      logger,
      sender: { sendMessage, sendChatAction },
      sessionGateway,
      sessionBindingsRepository,
      inboundMessagesRepository,
      outboundMessagesRepository,
      promptTimeoutMs: 30_000,
    })

    // Act
    const pendingHandle = bridge.handleTextMessage({
      sourceMessageId: "typing-1",
      chatId: 7,
      userId: 9,
      text: "hi",
    })

    await Promise.resolve()
    resolvePrompt("done")
    await pendingHandle

    // Assert
    expect(sendChatAction).toHaveBeenCalledWith(7, "typing")
    expect(sendMessage).toHaveBeenCalledWith(7, "done")
  })
})
