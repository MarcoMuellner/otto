import { describe, expect, it, vi } from "vitest"
import type { Logger } from "pino"

import {
  createQueueTelegramMessageTool,
  type OutboundMessageEnqueueRepository,
} from "../../src/telegram-worker/outbound-tool.js"
import { TELEGRAM_MESSAGE_LIMIT } from "../../src/telegram-worker/telegram.js"

const createLoggerStub = (): Logger => {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as Logger
}

describe("createQueueTelegramMessageTool", () => {
  it("enqueues queue records and returns enqueued status", () => {
    // Arrange
    const repository: OutboundMessageEnqueueRepository = {
      enqueueOrIgnoreDedupe: vi.fn<OutboundMessageEnqueueRepository["enqueueOrIgnoreDedupe"]>(
        () => "enqueued"
      ),
    }
    const tool = createQueueTelegramMessageTool({
      logger: createLoggerStub(),
      outboundMessagesRepository: repository,
    })

    // Act
    const result = tool.execute({
      chatId: 777,
      content: "hello",
      dedupeKey: "task-123",
    })

    // Assert
    expect(result.status).toBe("enqueued")
    expect(result.queuedCount).toBe(1)
    expect(result.duplicateCount).toBe(0)
    expect(repository.enqueueOrIgnoreDedupe).toHaveBeenCalledOnce()
  })

  it("returns duplicate when every chunk already exists", () => {
    // Arrange
    const repository: OutboundMessageEnqueueRepository = {
      enqueueOrIgnoreDedupe: vi.fn<OutboundMessageEnqueueRepository["enqueueOrIgnoreDedupe"]>(
        () => "duplicate"
      ),
    }
    const tool = createQueueTelegramMessageTool({
      logger: createLoggerStub(),
      outboundMessagesRepository: repository,
    })

    // Act
    const result = tool.execute({
      chatId: 777,
      content: "hello",
      dedupeKey: "task-123",
    })

    // Assert
    expect(result.status).toBe("duplicate")
    expect(result.queuedCount).toBe(0)
    expect(result.duplicateCount).toBe(1)
  })

  it("splits oversized payloads and writes chunked dedupe keys", () => {
    // Arrange
    const repository: OutboundMessageEnqueueRepository = {
      enqueueOrIgnoreDedupe: vi.fn<OutboundMessageEnqueueRepository["enqueueOrIgnoreDedupe"]>(
        () => "enqueued"
      ),
    }
    const tool = createQueueTelegramMessageTool({
      logger: createLoggerStub(),
      outboundMessagesRepository: repository,
    })
    const content = "x".repeat(TELEGRAM_MESSAGE_LIMIT + 20)

    // Act
    const result = tool.execute({
      chatId: 777,
      content,
      dedupeKey: "bulk-1",
    })

    // Assert
    expect(result.status).toBe("enqueued")
    expect(result.queuedCount).toBe(2)
    const firstCall = vi.mocked(repository.enqueueOrIgnoreDedupe).mock.calls[0]?.[0]
    const secondCall = vi.mocked(repository.enqueueOrIgnoreDedupe).mock.calls[1]?.[0]
    expect(firstCall?.dedupeKey).toBe("bulk-1:1/2")
    expect(secondCall?.dedupeKey).toBe("bulk-1:2/2")
  })
})
