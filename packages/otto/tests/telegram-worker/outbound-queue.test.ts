import { mkdtemp, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

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
          kind: "text" as const,
          content: "hello",
          mediaPath: null,
          mediaMimeType: null,
          mediaFilename: null,
          priority: "normal" as const,
          attemptCount: 0,
          createdAt: 900,
          errorMessage: null,
        },
      ]),
      markSent: vi.fn(),
      markRetry: vi.fn(),
      markFailed: vi.fn(),
    }
    const sender = {
      sendMessage: vi.fn(async () => {}),
      sendDocument: vi.fn(async () => {}),
      sendPhoto: vi.fn(async () => {}),
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
      userProfileRepository: {
        get: () => null,
        setLastDigestAt: vi.fn(),
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
          kind: "text" as const,
          content: "hello",
          mediaPath: null,
          mediaMimeType: null,
          mediaFilename: null,
          priority: "normal" as const,
          attemptCount: 1,
          createdAt: 900,
          errorMessage: null,
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
      sendDocument: vi.fn(async () => {}),
      sendPhoto: vi.fn(async () => {}),
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
      userProfileRepository: {
        get: () => null,
        setLastDigestAt: vi.fn(),
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

  it("delivers queued document messages via sendDocument", async () => {
    // Arrange
    const logger = createLoggerStub()
    const tempDirectory = await mkdtemp(path.join(tmpdir(), "otto-outbound-queue-"))
    const stagedFilePath = path.join(tempDirectory, "report.pdf")
    await writeFile(stagedFilePath, "pdf", "utf8")

    const repository = {
      listDue: vi.fn(() => [
        {
          id: "out-doc-1",
          chatId: 88,
          kind: "document" as const,
          content: "doc caption",
          mediaPath: stagedFilePath,
          mediaMimeType: "application/pdf",
          mediaFilename: "report.pdf",
          priority: "normal" as const,
          attemptCount: 0,
          createdAt: 900,
          errorMessage: null,
        },
      ]),
      markSent: vi.fn(),
      markRetry: vi.fn(),
      markFailed: vi.fn(),
    }
    const sender = {
      sendMessage: vi.fn(async () => {}),
      sendDocument: vi.fn(async () => {}),
      sendPhoto: vi.fn(async () => {}),
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
      userProfileRepository: {
        get: () => null,
        setLastDigestAt: vi.fn(),
      },
    })

    // Act
    await processor.drainDueMessages(1_000)

    // Assert
    expect(sender.sendDocument).toHaveBeenCalledWith(88, {
      filePath: stagedFilePath,
      filename: "report.pdf",
      caption: "doc caption",
    })
    await expect(stat(stagedFilePath)).rejects.toThrow()
  })

  it("marks permanent failure when max attempts are reached", async () => {
    // Arrange
    const logger = createLoggerStub()
    const repository = {
      listDue: vi.fn(() => [
        {
          id: "out-3",
          chatId: 88,
          kind: "text" as const,
          content: "hello",
          mediaPath: null,
          mediaMimeType: null,
          mediaFilename: null,
          priority: "normal" as const,
          attemptCount: 2,
          createdAt: 900,
          errorMessage: null,
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
      sendDocument: vi.fn(async () => {}),
      sendPhoto: vi.fn(async () => {}),
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
      userProfileRepository: {
        get: () => null,
        setLastDigestAt: vi.fn(),
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

  it("suppresses normal messages during quiet hours", async () => {
    // Arrange
    const logger = createLoggerStub()
    const repository = {
      listDue: vi.fn(() => [
        {
          id: "out-quiet-1",
          chatId: 101,
          kind: "text" as const,
          content: "quiet test",
          mediaPath: null,
          mediaMimeType: null,
          mediaFilename: null,
          priority: "normal" as const,
          attemptCount: 0,
          createdAt: 900,
          errorMessage: null,
        },
      ]),
      markSent: vi.fn(),
      markRetry: vi.fn(),
      markFailed: vi.fn(),
    }
    const sender = {
      sendMessage: vi.fn(async () => {}),
      sendDocument: vi.fn(async () => {}),
      sendPhoto: vi.fn(async () => {}),
    }
    const processor = createOutboundQueueProcessor({
      logger,
      repository,
      sender,
      retryPolicy: {
        maxAttempts: 3,
        baseDelayMs: 1_000,
        maxDelayMs: 60_000,
      },
      userProfileRepository: {
        get: () => ({
          timezone: "Europe/Vienna",
          quietHoursStart: "20:00",
          quietHoursEnd: "08:00",
          quietMode: "critical_only",
          muteUntil: null,
          heartbeatMorning: "08:30",
          heartbeatMidday: "12:30",
          heartbeatEvening: "19:00",
          heartbeatCadenceMinutes: 180,
          heartbeatOnlyIfSignal: true,
          onboardingCompletedAt: Date.now(),
          lastDigestAt: null,
          updatedAt: Date.now(),
        }),
        setLastDigestAt: vi.fn(),
      },
    })

    // Act
    await processor.drainDueMessages(new Date("2026-02-20T22:15:00+01:00").getTime())

    // Assert
    expect(sender.sendMessage).not.toHaveBeenCalled()
    expect(repository.markRetry).toHaveBeenCalledOnce()
    const reason = vi.mocked(repository.markRetry).mock.calls[0]?.[3]
    expect(reason).toContain("suppressed_by_policy")
  })

  it("does not release suppressed digest while quiet-hours gate is still active", async () => {
    // Arrange
    const logger = createLoggerStub()
    const repository = {
      listDue: vi.fn(() => [
        {
          id: "out-supp-1",
          chatId: 101,
          kind: "text" as const,
          content: "suppressed",
          mediaPath: null,
          mediaMimeType: null,
          mediaFilename: null,
          priority: "normal" as const,
          attemptCount: 1,
          createdAt: 900,
          errorMessage: "suppressed_by_policy:quiet_hours",
        },
      ]),
      markSent: vi.fn(),
      markRetry: vi.fn(),
      markFailed: vi.fn(),
    }
    const sender = {
      sendMessage: vi.fn(async () => {}),
      sendDocument: vi.fn(async () => {}),
      sendPhoto: vi.fn(async () => {}),
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
      userProfileRepository: {
        get: () => ({
          timezone: "Europe/Vienna",
          quietHoursStart: "20:00",
          quietHoursEnd: "08:00",
          quietMode: "critical_only",
          muteUntil: null,
          heartbeatMorning: "08:30",
          heartbeatMidday: "12:30",
          heartbeatEvening: "19:00",
          heartbeatCadenceMinutes: 180,
          heartbeatOnlyIfSignal: true,
          onboardingCompletedAt: Date.now(),
          lastDigestAt: null,
          updatedAt: Date.now(),
        }),
        setLastDigestAt: vi.fn(),
      },
      jobsRepository: {
        listRecentRuns: vi.fn(() => []),
      },
    })

    // Act
    await processor.drainDueMessages(new Date("2026-02-20T22:15:00+01:00").getTime())

    // Assert
    expect(sender.sendMessage).not.toHaveBeenCalled()
    expect(repository.markSent).not.toHaveBeenCalled()
    expect(repository.markRetry).toHaveBeenCalled()
  })
})
