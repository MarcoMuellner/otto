import { describe, expect, it, vi } from "vitest"

import { createNonInteractiveContextCaptureService } from "../../src/runtime/non-interactive-context-capture.js"

describe("non-interactive context capture service", () => {
  it("captures chunk-aligned queued text messages", () => {
    // Arrange
    const insert = vi.fn()
    const warn = vi.fn()
    const service = createNonInteractiveContextCaptureService({
      logger: {
        warn,
      },
      interactiveContextEventsRepository: {
        insert,
      },
    })

    // Act
    service.captureQueuedTextMessage({
      sourceSessionId: "session-1",
      sourceLane: "scheduler",
      sourceKind: "background_lifecycle",
      sourceRef: "job-1:run-1:start",
      content: "hello",
      messageIds: ["msg-1"],
      enqueueStatus: "enqueued",
      timestamp: 1_000,
    })

    // Assert
    expect(insert).toHaveBeenCalledOnce()
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceSessionId: "session-1",
        outboundMessageId: "msg-1",
        content: "hello",
        deliveryStatus: "queued",
      })
    )
    expect(warn).not.toHaveBeenCalled()
  })

  it("skips capture when message ids do not align with split chunks", () => {
    // Arrange
    const insert = vi.fn()
    const warn = vi.fn()
    const service = createNonInteractiveContextCaptureService({
      logger: {
        warn,
      },
      interactiveContextEventsRepository: {
        insert,
      },
    })

    const content = "x".repeat(5_000)

    // Act
    service.captureQueuedTextMessage({
      sourceSessionId: "session-1",
      sourceLane: "internal_api",
      sourceKind: "queue_telegram_message",
      content,
      messageIds: ["msg-1"],
      enqueueStatus: "enqueued",
    })

    // Assert
    expect(insert).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledOnce()
  })
})
