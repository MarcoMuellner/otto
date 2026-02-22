import { useEffect, useState } from "react"
import { Link, useLoaderData, useNavigation } from "react-router"

import { JobAuditList } from "../components/jobs/job-audit-list.js"
import { JobDetailCard } from "../components/jobs/job-detail-card.js"
import { JobRunsPanel } from "../components/jobs/job-runs-panel.js"
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card.js"
import type {
  ExternalJobAuditEntry,
  ExternalJobDetail,
  ExternalJobRun,
  ExternalJobRunsResponse,
} from "../features/jobs/contracts.js"
import { getJobDisplayTitle } from "../features/jobs/presentation.js"
import { createOttoExternalApiClientFromEnvironment } from "../server/otto-external-api.server.js"

type JobDetailLoaderArgs = {
  params: {
    jobId?: string
  }
  request: Request
}

const RUN_PAGE_SIZE = 12

const parseRunsOffset = (request: Request): number => {
  const rawOffset = new URL(request.url).searchParams.get("offset")
  if (!rawOffset) {
    return 0
  }

  const parsed = Number(rawOffset)
  if (!Number.isInteger(parsed)) {
    return 0
  }

  return Math.max(0, parsed)
}

const parseSelectedRunId = (request: Request): string | null => {
  const rawRunId = new URL(request.url).searchParams.get("runId")
  const runId = rawRunId?.trim()
  return runId && runId.length > 0 ? runId : null
}

type JobDetailLoaderData =
  | {
      status: "success"
      job: ExternalJobDetail
      auditEntries: ExternalJobAuditEntry[]
      runs: ExternalJobRunsResponse
      selectedRun: ExternalJobRun | null
      runsAvailable: boolean
      now: number
    }
  | {
      status: "error"
      message: string
    }

export const loader = async ({
  params,
  request,
}: JobDetailLoaderArgs): Promise<JobDetailLoaderData> => {
  const jobId = params.jobId?.trim()
  if (!jobId) {
    return {
      status: "error",
      message: "Job id is required.",
    }
  }

  try {
    const client = await createOttoExternalApiClientFromEnvironment()
    const offset = parseRunsOffset(request)
    const selectedRunId = parseSelectedRunId(request)

    const [detail, audit] = await Promise.all([client.getJob(jobId), client.getJobAudit(jobId, 20)])

    let runsAvailable = true
    let runs: ExternalJobRunsResponse = {
      taskId: jobId,
      total: 0,
      limit: RUN_PAGE_SIZE,
      offset,
      runs: [],
    }

    try {
      runs = await client.getJobRuns(jobId, { limit: RUN_PAGE_SIZE, offset })
    } catch {
      runsAvailable = false
    }

    const fallbackRunId = runs.runs[0]?.id ?? null
    const resolvedRunId = selectedRunId ?? fallbackRunId

    let selectedRun: ExternalJobRun | null = null
    if (resolvedRunId && runsAvailable) {
      try {
        const runDetail = await client.getJobRun(jobId, resolvedRunId)
        selectedRun = runDetail.run
      } catch {
        selectedRun = null
      }
    }

    return {
      status: "success",
      job: detail.job,
      auditEntries: audit.entries,
      runs,
      selectedRun,
      runsAvailable,
      now: Date.now(),
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
  const loaderNow = data.status === "success" ? data.now : Date.now()
  const [referenceNow, setReferenceNow] = useState(loaderNow)
  const displayTitle =
    data.status === "success" ? getJobDisplayTitle(data.job.type) : "Task inspection"

  useEffect(() => {
    setReferenceNow(loaderNow)
  }, [loaderNow])

  useEffect(() => {
    if (data.status !== "success") {
      return
    }

    const handle = window.setInterval(() => {
      setReferenceNow(Date.now())
    }, 30_000)

    return () => {
      window.clearInterval(handle)
    }
  }, [data.status])

  return (
    <section className="relative min-h-[calc(100dvh-4rem)] w-full">
      <div
        className="absolute inset-0 bg-[rgba(248,248,248,0.62)] backdrop-blur-sm"
        aria-hidden="true"
      />

      <article className="relative ml-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-[1200px] flex-col border-l border-[rgba(26,26,26,0.08)] bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-[rgba(26,26,26,0.08)] bg-[rgba(248,248,248,0.7)] px-6 py-5">
          <div>
            <p className="mb-1 font-mono text-[11px] tracking-[0.12em] text-[#888888] uppercase">
              {data.status === "success" ? `Job ID: ${data.job.id}` : "Job detail"}
            </p>
            <h1 className="m-0 max-w-[42rem] overflow-hidden text-3xl leading-tight font-light text-[#1a1a1a] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
              {displayTitle}
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

        <div className="hide-scrollbar flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
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
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
              <div className="space-y-4">
                <JobRunsPanel
                  jobId={data.job.id}
                  runs={data.runs}
                  selectedRun={data.selectedRun}
                  runsAvailable={data.runsAvailable}
                />
                <JobAuditList entries={data.auditEntries} />
              </div>

              <div>
                <JobDetailCard job={data.job} referenceNow={referenceNow} />
              </div>
            </div>
          )}
        </div>
      </article>
    </section>
  )
}
