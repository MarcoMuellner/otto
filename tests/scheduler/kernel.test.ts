import { afterEach, describe, expect, it, vi } from "vitest"

import { startSchedulerKernel } from "../../src/scheduler/kernel.js"

afterEach(() => {
  vi.useRealTimers()
})

const createLoggerStub = () => {
  const info = vi.fn()
  const error = vi.fn()

  return {
    info,
    error,
    logger: {
      info,
      error,
    },
  }
}

describe("startSchedulerKernel", () => {
  it("claims due jobs on startup and releases their locks", async () => {
    // Arrange
    vi.useFakeTimers()
    const { logger } = createLoggerStub()
    const jobsRepository = {
      claimDue: vi.fn(() => [
        {
          id: "job-1",
          type: "oneshot_tick",
        },
      ]),
      releaseLock: vi.fn(),
    }

    // Act
    const kernel = await startSchedulerKernel({
      logger,
      jobsRepository,
      config: {
        enabled: true,
        tickMs: 60_000,
        batchSize: 10,
        lockLeaseMs: 90_000,
      },
      now: () => 1_000,
      createLockToken: () => "lock-1",
    })

    // Assert
    expect(jobsRepository.claimDue).toHaveBeenCalledWith(1_000, 10, "lock-1", 90_000, 1_000)
    expect(jobsRepository.releaseLock).toHaveBeenCalledWith("job-1", "lock-1", 1_000)

    await kernel.stop()
  })

  it("runs subsequent ticks at configured interval", async () => {
    // Arrange
    vi.useFakeTimers()
    const { logger } = createLoggerStub()
    const jobsRepository = {
      claimDue: vi.fn(() => []),
      releaseLock: vi.fn(),
    }
    let nowValue = 1_000

    // Act
    const kernel = await startSchedulerKernel({
      logger,
      jobsRepository,
      config: {
        enabled: true,
        tickMs: 5_000,
        batchSize: 10,
        lockLeaseMs: 10_000,
      },
      now: () => nowValue,
      createLockToken: () => "lock-2",
    })

    nowValue = 6_000
    vi.advanceTimersByTime(5_000)
    await Promise.resolve()

    // Assert
    expect(jobsRepository.claimDue).toHaveBeenCalledTimes(2)
    expect(jobsRepository.claimDue).toHaveBeenNthCalledWith(2, 6_000, 10, "lock-2", 10_000, 6_000)

    await kernel.stop()
  })

  it("returns no-op handle when scheduler is disabled", async () => {
    // Arrange
    const { logger, info } = createLoggerStub()
    const jobsRepository = {
      claimDue: vi.fn(() => []),
      releaseLock: vi.fn(),
    }

    // Act
    const kernel = await startSchedulerKernel({
      logger,
      jobsRepository,
      config: {
        enabled: false,
        tickMs: 60_000,
        batchSize: 10,
        lockLeaseMs: 90_000,
      },
    })
    await kernel.stop()

    // Assert
    expect(jobsRepository.claimDue).not.toHaveBeenCalled()
    expect(info).toHaveBeenCalledWith("Scheduler kernel disabled by configuration")
  })
})
