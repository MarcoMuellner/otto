import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card.js"
import type { ExternalJobListItem } from "../../features/jobs/contracts.js"
import { JobListItem } from "./job-list-item.js"

type JobsGroupCardProps = {
  title: string
  description: string
  emptyMessage: string
  jobs: ExternalJobListItem[]
}

/**
 * Displays one logical jobs group so system and operator tasks can stay visually separated
 * without duplicating section layout markup across route files.
 */
export const JobsGroupCard = ({ title, description, emptyMessage, jobs }: JobsGroupCardProps) => {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{description}</CardDescription>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {jobs.length === 0 ? (
          <p className="m-0 text-sm text-[#888888]">{emptyMessage}</p>
        ) : (
          <div className="grid gap-2">
            {jobs.map((job) => (
              <JobListItem key={job.id} job={job} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
