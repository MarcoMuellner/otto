import type { ExternalJobAuditEntry } from "../../features/jobs/contracts.js"

type JobAuditListProps = {
  entries: ExternalJobAuditEntry[]
}

const formatTimestamp = (timestamp: number): string => {
  return new Date(timestamp).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
}

/**
 * Renders task audit events in a console-like block so operators can quickly scan recent task
 * history in the same visual language as the prototype's run-detail log panel.
 */
export const JobAuditList = ({ entries }: JobAuditListProps) => {
  return (
    <section>
      <h3 className="mb-3 text-sm font-medium text-[#1a1a1a]">Recent Audit Events</h3>
      <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-[rgba(26,26,26,0.1)] bg-[rgba(248,248,248,0.85)] p-4 font-mono text-xs text-[#666666] shadow-inner">
        {entries.length === 0 ? (
          <p className="m-0 text-[#888888]">No audit entries for this task yet.</p>
        ) : (
          entries.map((entry) => (
            <p key={entry.id} className="m-0">
              <span className="text-[#888888]">[{formatTimestamp(entry.createdAt)}]</span>{" "}
              <span className="text-[#1a1a1a]">{entry.action}</span> lane={entry.lane}
            </p>
          ))
        )}
      </div>
    </section>
  )
}
