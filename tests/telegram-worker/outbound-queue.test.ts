import { describe, expect, it, vi } from "vitest"
import type { Logger } from "pino"

import {
  calculateRetryDelayMs,
  createOutboundQueueProcessor,
} from "../../src/telegram-worker/outbound-queue.js"

const createLoggerStub = (): Logger => {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as Logger
}

describe("outbound queue processor", () => {
  it("calculates capped exponential retry delay", () => {
    // Arrange
    const policy = {
      maxAttempts: 5,
      baseDelayMs: 1_000,
      maxDelayMs: 8_000,
    }

    // Act
    const firstRetry = calculateRetryDelayMs(1, policy)
    const secondRetry = calculateRetryDelayMs(2, policy)
    const cappedRetry = calculateRetryDelayMs(8, policy)

    // Assert
    expect(firstRetry).toBe(1_000)
    expect(secondRetry).toBe(2_000)
    expect(cappedRetry).toBe(8_000)
  })

  it("marks due messages as sent after successful delivery", async () => {
    // Arrange
    const logger = createLoggerStub()
    const repository = {
      listDue: vi.fn(() => [
        {
          id: "out-1",
          chatId: 77,
          content: "hello",
          attemptCount: 0,
        },
      ]),
      markSent: vi.fn(),
      markRetry: vi.fn(),
      markFailed: vi.fn(),
    }
    const sender = {
      sendMessage: vi.fn(async () => {}),
    }
    const processor = createOutboundQueueProcessor({
      logger,
      repository,
      sender,
      retryPolicy: {
        maxAttempts: 5,
        baseDelayMs: 1_000,
        maxDelayMs: 60_000,
      },
    })

    // Act
    await processor.drainDueMessages(1_000)

    // Assert
    expect(sender.sendMessage).toHaveBeenCalledWith(77, "hello")
    expect(repository.markSent).toHaveBeenCalledOnce()
    expect(repository.markRetry).not.toHaveBeenCalled()
    expect(repository.markFailed).not.toHaveBeenCalled()
  })

  it("queues retry when delivery fails before max attempts", async () => {
    // Arrange
    const logger = createLoggerStub()
    const repository = {
      listDue: vi.fn(() => [
        {
          id: "out-2",
          chatId: 99,
          content: "hello",
          attemptCount: 1,
        },
      ]),
      markSent: vi.fn(),
      markRetry: vi.fn(),
      markFailed: vi.fn(),
    }
    const sender = {
      sendMessage: vi.fn(async () => {
        throw new Error("network timeout")
      }),
    }
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(5_000)
    const processor = createOutboundQueueProcessor({
      logger,
      repository,
      sender,
      retryPolicy: {
        maxAttempts: 5,
        baseDelayMs: 2_000,
        maxDelayMs: 60_000,
      },
    })

    // Act
    await processor.drainDueMessages(4_000)

    // Assert
    expect(repository.markSent).not.toHaveBeenCalled()
    expect(repository.markFailed).not.toHaveBeenCalled()
    expect(repository.markRetry).toHaveBeenCalledWith("out-2", 2, 9_000, "network timeout", 5_000)
    nowSpy.mockRestore()
  })

  it("marks permanent failure when max attempts are reached", async () => {
    // Arrange
    const logger = createLoggerStub()
    const repository = {
      listDue: vi.fn(() => [
        {
          id: "out-3",
          chatId: 88,
          content: "hello",
          attemptCount: 2,
        },
      ]),
      markSent: vi.fn(),
      markRetry: vi.fn(),
      markFailed: vi.fn(),
    }
    const sender = {
      sendMessage: vi.fn(async () => {
        throw new Error("telegram 429")
      }),
    }
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(9_000)
    const processor = createOutboundQueueProcessor({
      logger,
      repository,
      sender,
      retryPolicy: {
        maxAttempts: 3,
        baseDelayMs: 1_000,
        maxDelayMs: 60_000,
      },
    })

    // Act
    await processor.drainDueMessages(4_000)

    // Assert
    expect(repository.markSent).not.toHaveBeenCalled()
    expect(repository.markRetry).not.toHaveBeenCalled()
    expect(repository.markFailed).toHaveBeenCalledWith("out-3", 3, "telegram 429", 9_000)
    nowSpy.mockRestore()
  })
})
