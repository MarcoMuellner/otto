import type { JobRecord, JobTerminalState } from "../persistence/repositories.js"

export type ScheduleTransition =
  | {
      mode: "reschedule"
      nextRunAt: number
      lastRunAt: number
    }
  | {
      mode: "finalize"
      terminalState: JobTerminalState
      terminalReason: string | null
      lastRunAt: number
    }

/**
 * Computes post-run schedule state so recurring tasks continue predictably while one-shot tasks
 * transition to a terminal state after their due execution.
 *
 * @param job Claimed job record with schedule metadata.
 * @param completedAt Timestamp when the run completed.
 * @returns Next scheduling transition to persist.
 */
export const resolveScheduleTransition = (
  job: Pick<JobRecord, "id" | "scheduleType" | "cadenceMinutes">,
  completedAt: number
): ScheduleTransition => {
  if (job.scheduleType === "oneshot") {
    return {
      mode: "finalize",
      terminalState: "completed",
      terminalReason: null,
      lastRunAt: completedAt,
    }
  }

  const cadenceMinutes = job.cadenceMinutes
  if (!cadenceMinutes || cadenceMinutes < 1) {
    throw new Error(`Recurring job ${job.id} has invalid cadenceMinutes: ${String(cadenceMinutes)}`)
  }

  return {
    mode: "reschedule",
    lastRunAt: completedAt,
    nextRunAt: completedAt + cadenceMinutes * 60_000,
  }
}
