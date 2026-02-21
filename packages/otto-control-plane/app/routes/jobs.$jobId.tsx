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
    <section className="relative min-h-[calc(100dvh-4rem)] w-full">
      <div
        className="absolute inset-0 bg-[rgba(248,248,248,0.62)] backdrop-blur-sm"
        aria-hidden="true"
      />

      <article className="relative ml-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-2xl flex-col border-l border-[rgba(26,26,26,0.08)] bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-[rgba(26,26,26,0.08)] bg-[rgba(248,248,248,0.7)] px-6 py-5">
          <div>
            <p className="mb-1 font-mono text-[11px] tracking-[0.12em] text-[#888888] uppercase">
              {data.status === "success" ? `Job ID: ${data.job.id}` : "Job detail"}
            </p>
            <h1 className="m-0 text-3xl leading-none font-light text-[#1a1a1a]">
              {data.status === "success" ? data.job.type : "Task inspection"}
            </h1>
          </div>
          <Link
            to="/jobs"
            className="rounded-full border border-[rgba(26,26,26,0.12)] p-2 text-[#888888] transition-colors hover:bg-[rgba(26,26,26,0.05)] hover:text-[#1a1a1a]"
            aria-label="Back to jobs"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </Link>
        </header>

        <div className="hide-scrollbar flex-1 space-y-4 overflow-y-auto px-6 py-6">
          <CommandBar placeholder="Search actions or jump..." />

          {isLoading ? <p className="m-0 text-xs text-[#888888]">Refreshing detail...</p> : null}

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
            <>
              <JobDetailCard job={data.job} />
              <JobAuditList entries={data.auditEntries} />
            </>
          )}
        </div>
      </article>
    </section>
  )
}
