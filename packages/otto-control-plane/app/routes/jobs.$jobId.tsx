import { useEffect, useState } from "react"
import { Link, useLoaderData, useNavigation } from "react-router"

import { JobAuditList } from "../components/jobs/job-audit-list.js"
import { JobDetailCard } from "../components/jobs/job-detail-card.js"
import { JobRunsPanel } from "../components/jobs/job-runs-panel.js"
import { Button } from "../components/ui/button.js"
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card.js"
import type {
  ExternalJobAuditEntry,
  ExternalJobDetail,
  ExternalJobRun,
  ExternalJobRunsResponse,
} from "../features/jobs/contracts.js"
import { getJobDisplayTitle } from "../features/jobs/presentation.js"
import { cn } from "../lib/cn.js"
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
      selectedRunRequested: boolean
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
      selectedRunRequested: selectedRunId !== null,
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
  const [isInfoPanelOpen, setIsInfoPanelOpen] = useState(false)
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

  useEffect(() => {
    if (!isInfoPanelOpen) {
      return
    }

    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      setIsInfoPanelOpen(false)
    }

    window.addEventListener("keydown", handleEscape, { capture: true })

    return () => {
      window.removeEventListener("keydown", handleEscape, { capture: true })
    }
  }, [isInfoPanelOpen])

  return (
    <section className="h-[calc(100dvh-4rem)] w-full overflow-hidden px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
      <div className="mx-auto flex h-full w-full max-w-[1440px] flex-col gap-4">
        <header className="rounded-2xl border border-[rgba(26,26,26,0.08)] bg-[rgba(255,255,255,0.85)] px-5 py-4 shadow-[0_10px_32px_rgba(0,0,0,0.07)] backdrop-blur-sm sm:px-6 sm:py-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="mb-1 font-mono text-[11px] tracking-[0.12em] text-[#888888] uppercase">
                {data.status === "success" ? `Job ID: ${data.job.id}` : "Job detail"}
              </p>
              <h1 className="m-0 max-w-[54rem] overflow-hidden text-3xl leading-tight font-light text-[#1a1a1a] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                {displayTitle}
              </h1>
            </div>

            <Link
              to="/jobs"
              className="inline-flex self-start rounded-[11px] border border-[rgba(26,26,26,0.14)] bg-white px-3 py-2 font-mono text-xs tracking-[0.11em] text-[#666666] uppercase transition-colors hover:bg-[rgba(26,26,26,0.05)] hover:text-[#1a1a1a]"
            >
              ESC / Back
            </Link>

            {data.status === "success" ? (
              <Button
                variant="outline"
                size="sm"
                className="xl:hidden"
                onClick={() => setIsInfoPanelOpen(true)}
              >
                Job Info
              </Button>
            ) : null}
          </div>
        </header>

        {isLoading ? <p className="m-0 px-1 text-xs text-[#888888]">Refreshing detail...</p> : null}

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
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-3 xl:gap-5">
            <div className="min-h-0 xl:col-span-2">
              <JobRunsPanel
                jobId={data.job.id}
                runs={data.runs}
                selectedRun={data.selectedRun}
                runsAvailable={data.runsAvailable}
                selectedRunRequested={data.selectedRunRequested}
              />
            </div>

            <aside className="hide-scrollbar hidden min-h-0 space-y-4 overflow-y-auto xl:block xl:col-span-1">
              <JobDetailCard job={data.job} referenceNow={referenceNow} />
              <JobAuditList entries={data.auditEntries} />
            </aside>
          </div>
        )}
      </div>

      {data.status === "success" ? (
        <div
          className={cn(
            "fixed inset-0 z-30 xl:hidden transition-opacity duration-200",
            isInfoPanelOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
          )}
          aria-hidden={!isInfoPanelOpen}
        >
          <button
            type="button"
            className="absolute inset-0 bg-[rgba(17,17,17,0.34)]"
            aria-label="Close job info panel"
            onClick={() => setIsInfoPanelOpen(false)}
          />

          <aside
            className={cn(
              "absolute top-0 right-0 h-full w-[92vw] max-w-[540px] border-l border-[rgba(26,26,26,0.08)] bg-white shadow-2xl transition-transform duration-200",
              isInfoPanelOpen ? "translate-x-0" : "translate-x-full"
            )}
          >
            <div className="flex h-full flex-col">
              <header className="flex items-center justify-between border-b border-[rgba(26,26,26,0.08)] px-4 py-3">
                <h2 className="m-0 text-sm font-medium text-[#1a1a1a]">Job Info</h2>
                <button
                  type="button"
                  className="rounded-[10px] border border-[rgba(26,26,26,0.12)] px-3 py-1.5 font-mono text-[0.68rem] tracking-[0.1em] text-[#666666] uppercase"
                  onClick={() => setIsInfoPanelOpen(false)}
                >
                  Close
                </button>
              </header>

              <div className="hide-scrollbar flex-1 space-y-4 overflow-y-auto p-4">
                <JobDetailCard job={data.job} referenceNow={referenceNow} />
                <JobAuditList entries={data.auditEntries} />
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </section>
  )
}
