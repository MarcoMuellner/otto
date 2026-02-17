import { randomUUID } from "node:crypto"

import type { Logger } from "pino"

import type { SchedulerConfig } from "./config.js"

export type SchedulerJobsRepository = {
  claimDue: (
    timestamp: number,
    limit: number,
    lockToken: string,
    lockLeaseMs: number,
    updatedAt?: number
  ) => Array<{ id: string; type: string }>
  releaseLock: (jobId: string, lockToken: string, updatedAt?: number) => void
}

export type SchedulerKernelHandle = {
  stop: () => Promise<void>
}

type SchedulerLogger = Pick<Logger, "info" | "error">

type SchedulerKernelDependencies = {
  logger: SchedulerLogger
  jobsRepository: SchedulerJobsRepository
  config: SchedulerConfig
  now?: () => number
  createLockToken?: () => string
}

/**
 * Starts the minute scheduler kernel that claims due jobs with leases and releases claims when
 * no execution engine is attached, preserving restart-safe orchestration semantics.
 *
 * @param dependencies Scheduler configuration, persistence repository, and observability hooks.
 * @returns Handle used by runtime orchestrators to stop scheduler resources.
 */
export const startSchedulerKernel = async (
  dependencies: SchedulerKernelDependencies
): Promise<SchedulerKernelHandle> => {
  if (!dependencies.config.enabled) {
    dependencies.logger.info("Scheduler kernel disabled by configuration")
    return {
      stop: async () => {
        dependencies.logger.info("Scheduler kernel stop requested while disabled")
      },
    }
  }

  const now = dependencies.now ?? Date.now
  const createLockToken = dependencies.createLockToken ?? randomUUID

  let stopped = false
  let runningTick = false

  const runTick = async (): Promise<void> => {
    if (stopped || runningTick) {
      return
    }

    runningTick = true

    try {
      const tickNow = now()
      const lockToken = createLockToken()
      const claimed = dependencies.jobsRepository.claimDue(
        tickNow,
        dependencies.config.batchSize,
        lockToken,
        dependencies.config.lockLeaseMs,
        tickNow
      )

      if (claimed.length > 0) {
        dependencies.logger.info(
          {
            claimedCount: claimed.length,
            jobIds: claimed.map((job) => job.id),
          },
          "Scheduler kernel claimed due jobs"
        )
      }

      for (const job of claimed) {
        dependencies.jobsRepository.releaseLock(job.id, lockToken, now())
      }
    } catch (error) {
      const err = error as Error
      dependencies.logger.error({ error: err.message }, "Scheduler kernel tick failed")
    } finally {
      runningTick = false
    }
  }

  dependencies.logger.info(
    {
      tickMs: dependencies.config.tickMs,
      batchSize: dependencies.config.batchSize,
      lockLeaseMs: dependencies.config.lockLeaseMs,
    },
    "Scheduler kernel started"
  )

  await runTick()

  const timer = setInterval(() => {
    void runTick()
  }, dependencies.config.tickMs)

  return {
    stop: async () => {
      stopped = true
      clearInterval(timer)
      dependencies.logger.info("Scheduler kernel stopped")
    },
  }
}
