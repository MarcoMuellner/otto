import { Link } from "react-router"

import type { ExternalJobListItem } from "../../features/jobs/contracts.js"

const formatTimestamp = (timestamp: number | null): string => {
  if (!timestamp) {
    return "-"
  }

  return new Date(timestamp).toLocaleString()
}

const describeSchedule = (job: ExternalJobListItem): string => {
  if (job.scheduleType === "recurring") {
    return `Every ${job.cadenceMinutes ?? "?"} min`
  }

  return `Runs at ${formatTimestamp(job.runAt)}`
}

type JobListItemProps = {
  job: ExternalJobListItem
}

/**
 * Renders one jobs-list row with compact status and schedule metadata so list sections can stay
 * scannable while preserving quick access to detail pages.
 */
export const JobListItem = ({ job }: JobListItemProps) => {
  return (
    <Link
      to={`/jobs/${encodeURIComponent(job.id)}`}
      className="grid gap-2 rounded-xl border border-[rgba(26,26,26,0.1)] bg-white p-3 transition-colors hover:bg-[rgba(26,26,26,0.03)]"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="m-0 font-medium text-[#1a1a1a]">{job.type}</p>
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

      <p className="m-0 text-sm text-[#4d4d4d]">{describeSchedule(job)}</p>
      <p className="m-0 text-xs text-[#888888]">Next run: {formatTimestamp(job.nextRunAt)}</p>
    </Link>
  )
}
