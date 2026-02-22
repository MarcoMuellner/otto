import { Link } from "react-router"

import type { ExternalJobListItem } from "../../features/jobs/contracts.js"
import { getJobDisplayTitle } from "../../features/jobs/presentation.js"
import { formatDateTime, formatNextRun } from "../../lib/date-time.js"

const describeSchedule = (job: ExternalJobListItem): string => {
  if (job.scheduleType === "recurring") {
    return `Every ${job.cadenceMinutes ?? "?"} min`
  }

  return `Runs at ${formatDateTime(job.runAt)}`
}

type JobListItemProps = {
  job: ExternalJobListItem
  referenceNow: number
}

/**
 * Renders one jobs-list row with compact status and schedule metadata so list sections can stay
 * scannable while preserving quick access to detail pages.
 */
export const JobListItem = ({ job, referenceNow }: JobListItemProps) => {
  const isRunning = job.status === "running"
  const displayTitle = getJobDisplayTitle(job.type)
  const nextRunLabel = formatNextRun(job.nextRunAt, referenceNow)

  return (
    <Link
      to={`/jobs/${encodeURIComponent(job.id)}`}
      className="grid gap-2 rounded-xl border border-[rgba(26,26,26,0.06)] bg-white p-4 shadow-sm transition-all hover:border-[rgba(26,26,26,0.2)]"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div
            className={
              isRunning
                ? "flex h-10 w-10 items-center justify-center rounded-full bg-[rgba(235,59,59,0.1)] text-[#eb3b3b]"
                : "flex h-10 w-10 items-center justify-center rounded-full bg-[rgba(26,26,26,0.05)] text-[rgba(26,26,26,0.45)]"
            }
          >
            {isRunning ? (
              <svg
                className="h-5 w-5 animate-spin"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9M4.582 9H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            ) : (
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            )}
          </div>
          <div>
            <p className="m-0 overflow-hidden text-lg font-light text-[#1a1a1a] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
              {displayTitle}
            </p>
            <p className="mt-1 mb-0 font-mono text-xs tracking-[0.08em] text-[#888888] uppercase">
              {isRunning ? "Running" : "Scheduled"} • {describeSchedule(job)}
            </p>
          </div>
        </div>

        <span
          className={
            job.isMutable
              ? "rounded-full border border-[rgba(26,26,26,0.12)] px-2 py-0.5 text-[11px] font-mono uppercase tracking-[0.08em] text-[#1a1a1a]"
              : "rounded-full border border-[rgba(235,59,59,0.3)] bg-[rgba(235,59,59,0.08)] px-2 py-0.5 text-[11px] font-mono uppercase tracking-[0.08em] text-[#eb3b3b]"
          }
        >
          {job.isMutable ? "Mutable" : "Read-only"}
        </span>
      </div>

      <p className="m-0 text-xs text-[#888888]">Next run: {nextRunLabel}</p>
    </Link>
  )
}
