import type { ExternalJobDetail } from "../../features/jobs/contracts.js"

const formatTimestamp = (timestamp: number | null): string => {
  if (!timestamp) {
    return "-"
  }

  return new Date(timestamp).toLocaleString()
}

const formatPayload = (payload: string | null): string => {
  if (!payload) {
    return "{}"
  }

  try {
    const parsed = JSON.parse(payload) as unknown
    return JSON.stringify(parsed, null, 2)
  } catch {
    return payload
  }
}

type JobDetailCardProps = {
  job: ExternalJobDetail
}

/**
 * Shows job detail in a panel-oriented layout aligned with the prototype, including status
 * blocks and payload preview for quick operator inspection.
 */
export const JobDetailCard = ({ job }: JobDetailCardProps) => {
  return (
    <section className="space-y-6">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-[rgba(26,26,26,0.08)] bg-[rgba(248,248,248,0.6)] p-4">
          <p className="mb-1 font-mono text-xs tracking-[0.08em] text-[#888888] uppercase">
            Status
          </p>
          <p
            className={
              job.status === "running"
                ? "m-0 flex items-center gap-2 font-mono text-sm text-[#eb3b3b]"
                : "m-0 flex items-center gap-2 font-mono text-sm text-[#1a1a1a]"
            }
          >
            <span
              className={
                job.status === "running"
                  ? "h-2 w-2 rounded-full bg-[#eb3b3b]"
                  : "h-2 w-2 rounded-full bg-[rgba(26,26,26,0.35)]"
              }
            />
            {job.status.toUpperCase()}
          </p>
        </div>

        <div className="rounded-lg border border-[rgba(26,26,26,0.08)] bg-[rgba(248,248,248,0.6)] p-4">
          <p className="mb-1 font-mono text-xs tracking-[0.08em] text-[#888888] uppercase">
            Schedule
          </p>
          <p className="m-0 font-mono text-sm text-[#1a1a1a]">
            {job.scheduleType === "recurring"
              ? `Every ${job.cadenceMinutes ?? "?"} minutes`
              : formatTimestamp(job.runAt)}
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-[rgba(26,26,26,0.08)] bg-white p-4">
        <h3 className="mt-0 mb-3 text-sm font-medium text-[#1a1a1a]">Lifecycle</h3>
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-mono text-xs tracking-[0.08em] text-[#888888] uppercase">
              Task id
            </dt>
            <dd className="m-0 mt-1 break-all text-[#1a1a1a]">{job.id}</dd>
          </div>
          <div>
            <dt className="font-mono text-xs tracking-[0.08em] text-[#888888] uppercase">
              Managed by
            </dt>
            <dd className="m-0 mt-1 text-[#1a1a1a]">{job.managedBy}</dd>
          </div>
          <div>
            <dt className="font-mono text-xs tracking-[0.08em] text-[#888888] uppercase">
              Next run
            </dt>
            <dd className="m-0 mt-1 text-[#1a1a1a]">{formatTimestamp(job.nextRunAt)}</dd>
          </div>
          <div>
            <dt className="font-mono text-xs tracking-[0.08em] text-[#888888] uppercase">
              Last run
            </dt>
            <dd className="m-0 mt-1 text-[#1a1a1a]">{formatTimestamp(job.lastRunAt)}</dd>
          </div>
        </dl>
      </div>

      <div className="rounded-lg border border-[rgba(26,26,26,0.08)] bg-white p-4">
        <h3 className="mt-0 mb-3 text-sm font-medium text-[#1a1a1a]">Configuration Payload</h3>
        <pre className="m-0 overflow-x-auto rounded-lg border border-[rgba(26,26,26,0.08)] bg-[rgba(248,248,248,0.8)] p-3 font-mono text-xs text-[#666666]">
          {formatPayload(job.payload)}
        </pre>
      </div>
    </section>
  )
}
