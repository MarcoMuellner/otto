import { describe, expect, it, vi } from "vitest"

import {
  enqueueTelegramFile,
  enqueueTelegramMessage,
  type OutboundMessageEnqueueRepository,
} from "../../src/telegram-worker/outbound-enqueue.js"
import { TELEGRAM_MESSAGE_LIMIT } from "../../src/telegram-worker/telegram.js"

describe("enqueueTelegramMessage", () => {
  it("enqueues a queued outbound message", () => {
    // Arrange
    const repository: OutboundMessageEnqueueRepository = {
      enqueueOrIgnoreDedupe: vi.fn<OutboundMessageEnqueueRepository["enqueueOrIgnoreDedupe"]>(
        () => "enqueued"
      ),
    }

    // Act
    const result = enqueueTelegramMessage(
      {
        chatId: 100,
        content: "hello",
        dedupeKey: "abc",
      },
      repository,
      500
    )

    // Assert
    expect(result).toMatchObject({
      status: "enqueued",
      queuedCount: 1,
      duplicateCount: 0,
      dedupeKey: "abc",
    })
    expect(repository.enqueueOrIgnoreDedupe).toHaveBeenCalledOnce()
  })

  it("returns duplicate when dedupe already exists", () => {
    // Arrange
    const repository: OutboundMessageEnqueueRepository = {
      enqueueOrIgnoreDedupe: vi.fn<OutboundMessageEnqueueRepository["enqueueOrIgnoreDedupe"]>(
        () => "duplicate"
      ),
    }

    // Act
    const result = enqueueTelegramMessage(
      {
        chatId: 100,
        content: "hello",
        dedupeKey: "abc",
      },
      repository,
      500
    )

    // Assert
    expect(result.status).toBe("duplicate")
    expect(result.queuedCount).toBe(0)
    expect(result.duplicateCount).toBe(1)
  })

  it("splits long content and appends per-chunk dedupe key", () => {
    // Arrange
    const repository: OutboundMessageEnqueueRepository = {
      enqueueOrIgnoreDedupe: vi.fn<OutboundMessageEnqueueRepository["enqueueOrIgnoreDedupe"]>(
        () => "enqueued"
      ),
    }
    const content = "x".repeat(TELEGRAM_MESSAGE_LIMIT + 1)

    // Act
    const result = enqueueTelegramMessage(
      {
        chatId: 100,
        content,
        dedupeKey: "job-1",
      },
      repository,
      500
    )

    // Assert
    expect(result.queuedCount).toBe(2)
    const firstRecord = vi.mocked(repository.enqueueOrIgnoreDedupe).mock.calls[0]?.[0]
    const secondRecord = vi.mocked(repository.enqueueOrIgnoreDedupe).mock.calls[1]?.[0]
    expect(firstRecord?.dedupeKey).toBe("job-1:1/2")
    expect(secondRecord?.dedupeKey).toBe("job-1:2/2")
  })

  it("enqueues a document outbound record", () => {
    // Arrange
    const repository: OutboundMessageEnqueueRepository = {
      enqueueOrIgnoreDedupe: vi.fn<OutboundMessageEnqueueRepository["enqueueOrIgnoreDedupe"]>(
        () => "enqueued"
      ),
    }

    // Act
    const result = enqueueTelegramFile(
      {
        chatId: 100,
        kind: "document",
        filePath: "/tmp/report.pdf",
        mimeType: "application/pdf",
        fileName: "report.pdf",
        caption: "latest",
      },
      repository,
      1_000
    )

    // Assert
    expect(result.status).toBe("enqueued")
    const firstCall = vi.mocked(repository.enqueueOrIgnoreDedupe).mock.calls[0]?.[0]
    expect(firstCall?.kind).toBe("document")
    expect(firstCall?.mediaPath).toBe("/tmp/report.pdf")
  })
})
