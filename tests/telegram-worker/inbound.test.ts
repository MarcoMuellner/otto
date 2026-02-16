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
    expect(sessionGateway.promptSession).toHaveBeenCalledWith("session-1", "hi")
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
    expect(sessionGateway.promptSession).not.toHaveBeenCalled()
    expect(sendMessage).not.toHaveBeenCalled()
  })
})
