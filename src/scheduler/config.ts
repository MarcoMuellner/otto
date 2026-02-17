import { z } from "zod"

export type SchedulerConfig = {
  enabled: boolean
  tickMs: number
  batchSize: number
  lockLeaseMs: number
}

const schedulerConfigSchema = z.object({
  OTTO_SCHEDULER_ENABLED: z.string().optional(),
  OTTO_SCHEDULER_TICK_MS: z.string().optional(),
  OTTO_SCHEDULER_BATCH_SIZE: z.string().optional(),
  OTTO_SCHEDULER_LOCK_LEASE_MS: z.string().optional(),
})

/**
 * Resolves scheduler loop configuration from environment so cadence and lock behavior can be
 * tuned operationally without source changes.
 *
 * @param environment Environment source, defaulting to process.env.
 * @returns Normalized scheduler runtime configuration.
 */
export const resolveSchedulerConfig = (
  environment: NodeJS.ProcessEnv = process.env
): SchedulerConfig => {
  const parsed = schedulerConfigSchema.safeParse(environment)

  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
      .join("; ")
    throw new Error(`Invalid scheduler config: ${detail}`)
  }

  const enabledRaw = parsed.data.OTTO_SCHEDULER_ENABLED
  const enabled = enabledRaw == null ? true : enabledRaw !== "0"

  const tickMsRaw = parsed.data.OTTO_SCHEDULER_TICK_MS
  const tickMs = tickMsRaw == null ? 60_000 : Number(tickMsRaw)
  if (!Number.isInteger(tickMs) || tickMs < 1_000) {
    throw new Error("Invalid scheduler config: OTTO_SCHEDULER_TICK_MS must be an integer >= 1000")
  }

  const batchSizeRaw = parsed.data.OTTO_SCHEDULER_BATCH_SIZE
  const batchSize = batchSizeRaw == null ? 20 : Number(batchSizeRaw)
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new Error("Invalid scheduler config: OTTO_SCHEDULER_BATCH_SIZE must be an integer >= 1")
  }

  const lockLeaseMsRaw = parsed.data.OTTO_SCHEDULER_LOCK_LEASE_MS
  const lockLeaseMs = lockLeaseMsRaw == null ? 90_000 : Number(lockLeaseMsRaw)
  if (!Number.isInteger(lockLeaseMs) || lockLeaseMs < tickMs) {
    throw new Error(
      "Invalid scheduler config: OTTO_SCHEDULER_LOCK_LEASE_MS must be an integer >= OTTO_SCHEDULER_TICK_MS"
    )
  }

  return {
    enabled,
    tickMs,
    batchSize,
    lockLeaseMs,
  }
}
