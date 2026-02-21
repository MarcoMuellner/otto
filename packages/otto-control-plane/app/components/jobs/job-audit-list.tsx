import type { ExternalJobAuditEntry } from "../../features/jobs/contracts.js"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card.js"

type JobAuditListProps = {
  entries: ExternalJobAuditEntry[]
}

const formatTimestamp = (timestamp: number): string => {
  return new Date(timestamp).toLocaleString()
}

/**
 * Renders recent task audit evidence so operators can inspect recent mutation history in the
 * detail view without leaving the job context.
 */
export const JobAuditList = ({ entries }: JobAuditListProps) => {
  return (
    <Card>
      <CardHeader>
        <CardDescription>Recent task audit</CardDescription>
        <CardTitle>Audit evidence</CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="m-0 text-sm text-[#888888]">No audit entries for this task yet.</p>
        ) : (
          <ul className="m-0 grid list-none gap-2 p-0">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="rounded-lg border border-[rgba(26,26,26,0.1)] bg-white px-3 py-2 text-sm"
              >
                <p className="m-0 font-medium text-[#1a1a1a]">
                  {entry.action} ({entry.lane})
                </p>
                <p className="m-0 mt-1 text-xs text-[#888888]">
                  {formatTimestamp(entry.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
