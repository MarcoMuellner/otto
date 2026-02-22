import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card.js"
import type { ExternalJobListItem } from "../../features/jobs/contracts.js"
import { JobListItem } from "./job-list-item.js"

type JobsGroupCardProps = {
  title: string
  description: string
  emptyMessage: string
  jobs: ExternalJobListItem[]
  referenceNow: number
}

/**
 * Displays one logical jobs group so system and operator tasks can stay visually separated
 * without duplicating section layout markup across route files.
 */
export const JobsGroupCard = ({
  title,
  description,
  emptyMessage,
  jobs,
  referenceNow,
}: JobsGroupCardProps) => {
  return (
    <Card className="rounded-xl border-[rgba(26,26,26,0.08)] shadow-sm">
      <CardHeader className="border-b border-[rgba(26,26,26,0.06)] pb-4">
        <CardDescription>{description}</CardDescription>
        <CardTitle className="text-[1.6rem] font-light tracking-tight">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-4 pb-4">
        <p className="m-0 font-mono text-xs text-[#888888]">{jobs.length} entries</p>
        {jobs.length === 0 ? (
          <p className="m-0 text-sm text-[#888888]">{emptyMessage}</p>
        ) : (
          <div className="grid gap-2">
            {jobs.map((job) => (
              <JobListItem key={job.id} job={job} referenceNow={referenceNow} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
