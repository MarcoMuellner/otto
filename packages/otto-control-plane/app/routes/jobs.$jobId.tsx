import { Link, useLoaderData, useNavigation } from "react-router"

import { CommandBar } from "../components/command/command-bar.js"
import { JobAuditList } from "../components/jobs/job-audit-list.js"
import { JobDetailCard } from "../components/jobs/job-detail-card.js"
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card.js"
import type { ExternalJobAuditEntry, ExternalJobDetail } from "../features/jobs/contracts.js"
import { createOttoExternalApiClientFromEnvironment } from "../server/otto-external-api.server.js"

type JobDetailLoaderArgs = {
  params: {
    jobId?: string
  }
}

type JobDetailLoaderData =
  | {
      status: "success"
      job: ExternalJobDetail
      auditEntries: ExternalJobAuditEntry[]
    }
  | {
      status: "error"
      message: string
    }

export const loader = async ({ params }: JobDetailLoaderArgs): Promise<JobDetailLoaderData> => {
  const jobId = params.jobId?.trim()
  if (!jobId) {
    return {
      status: "error",
      message: "Job id is required.",
    }
  }

  try {
    const client = await createOttoExternalApiClientFromEnvironment()
    const [detail, audit] = await Promise.all([client.getJob(jobId), client.getJobAudit(jobId, 20)])

    return {
      status: "success",
      job: detail.job,
      auditEntries: audit.entries,
    }
  } catch {
    return {
      status: "error",
      message: "Could not load this job right now.",
    }
  }
}

export default function JobDetailRoute() {
  const data = useLoaderData<typeof loader>()
  const navigation = useNavigation()
  const isLoading = navigation.state !== "idle"

  return (
    <section className="rounded-[24px] border border-[rgba(26,26,26,0.08)] bg-[rgba(255,255,255,0.74)] p-[26px] backdrop-blur-[8px] max-[720px]:p-[18px]">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="m-0 font-mono text-[11px] tracking-[0.12em] text-[#888888] uppercase">
            Job Detail
          </p>
          <h1 className="mt-1 mb-0 text-3xl leading-none font-light">Task inspection</h1>
        </div>
        <Link
          to="/jobs"
          className="rounded-full border border-[rgba(26,26,26,0.12)] bg-white px-3 py-1.5 text-xs font-mono tracking-[0.08em] text-[#1a1a1a] uppercase hover:bg-[rgba(26,26,26,0.04)]"
        >
          Back to jobs
        </Link>
      </header>

      <CommandBar
        placeholder="Type a command (Job detail)"
        entries={[
          { label: "Home", to: "/" },
          { label: "Jobs", to: "/jobs" },
        ]}
      />

      {isLoading ? <p className="mb-3 mt-0 text-xs text-[#888888]">Refreshing detail...</p> : null}

      {data.status === "error" ? (
        <Card>
          <CardHeader>
            <CardTitle>Job unavailable</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="m-0 text-sm text-[#888888]">{data.message}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          <JobDetailCard job={data.job} />
          <JobAuditList entries={data.auditEntries} />
        </div>
      )}
    </section>
  )
}
