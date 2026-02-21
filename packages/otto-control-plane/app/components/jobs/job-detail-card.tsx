import type { ExternalJobDetail } from "../../features/jobs/contracts.js"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card.js"

const formatTimestamp = (timestamp: number | null): string => {
  if (!timestamp) {
    return "-"
  }

  return new Date(timestamp).toLocaleString()
}

type JobDetailCardProps = {
  job: ExternalJobDetail
}

/**
 * Shows core job detail attributes in a compact read-only card so the operator can inspect
 * scheduling and lifecycle state before mutation actions are introduced in later tickets.
 */
export const JobDetailCard = ({ job }: JobDetailCardProps) => {
  return (
    <Card>
      <CardHeader>
        <CardDescription>
          {job.managedBy === "system" ? "System managed" : "Operator managed"}
        </CardDescription>
        <CardTitle>{job.type}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-mono text-xs tracking-[0.08em] text-[#888888] uppercase">
              Task id
            </dt>
            <dd className="m-0 mt-1 break-all text-[#1a1a1a]">{job.id}</dd>
          </div>
          <div>
            <dt className="font-mono text-xs tracking-[0.08em] text-[#888888] uppercase">Status</dt>
            <dd className="m-0 mt-1 text-[#1a1a1a]">{job.status}</dd>
          </div>
          <div>
            <dt className="font-mono text-xs tracking-[0.08em] text-[#888888] uppercase">
              Schedule
            </dt>
            <dd className="m-0 mt-1 text-[#1a1a1a]">{job.scheduleType}</dd>
          </div>
          <div>
            <dt className="font-mono text-xs tracking-[0.08em] text-[#888888] uppercase">
              Cadence
            </dt>
            <dd className="m-0 mt-1 text-[#1a1a1a]">{job.cadenceMinutes ?? "-"}</dd>
          </div>
          <div>
            <dt className="font-mono text-xs tracking-[0.08em] text-[#888888] uppercase">Run at</dt>
            <dd className="m-0 mt-1 text-[#1a1a1a]">{formatTimestamp(job.runAt)}</dd>
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
          <div>
            <dt className="font-mono text-xs tracking-[0.08em] text-[#888888] uppercase">
              Mutability
            </dt>
            <dd className="m-0 mt-1 text-[#1a1a1a]">{job.isMutable ? "Mutable" : "Read-only"}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  )
}
