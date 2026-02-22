import { Link } from "react-router"

import type { ExternalJobRun, ExternalJobRunsResponse } from "../../features/jobs/contracts.js"
import { formatDateTime } from "../../lib/date-time.js"
import { Button } from "../ui/button.js"

type JobRunsPanelProps = {
  jobId: string
  runs: ExternalJobRunsResponse
  selectedRun: ExternalJobRun | null
  runsAvailable: boolean
}

const formatDuration = (startedAt: number, finishedAt: number | null): string => {
  if (finishedAt === null) {
    return "in progress"
  }

  const deltaMs = Math.max(0, finishedAt - startedAt)
  const totalSeconds = Math.floor(deltaMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`
  }

  return `${seconds}s`
}

const parseResultJson = (resultJson: string | null): unknown => {
  if (!resultJson) {
    return null
  }

  try {
    return JSON.parse(resultJson) as unknown
  } catch {
    return resultJson
  }
}

const formatResultJson = (resultJson: string | null): string => {
  const parsed = parseResultJson(resultJson)
  if (parsed === null) {
    return "No result payload captured."
  }

  if (typeof parsed === "string") {
    return parsed
  }

  return JSON.stringify(parsed, null, 2)
}

const extractRawLlmOutput = (resultJson: string | null): string | null => {
  const parsed = parseResultJson(resultJson)
  if (!parsed || typeof parsed !== "object") {
    return null
  }

  const rawOutput = (parsed as { rawOutput?: unknown }).rawOutput
  return typeof rawOutput === "string" && rawOutput.trim().length > 0 ? rawOutput : null
}

const buildSearch = (offset: number, runId?: string): string => {
  const params = new URLSearchParams()
  params.set("offset", String(offset))
  if (runId) {
    params.set("runId", runId)
  }
  return `?${params.toString()}`
}

const resolveRunStatusClass = (status: ExternalJobRun["status"]): string => {
  if (status === "success") {
    return "text-[#059669]"
  }

  if (status === "failed") {
    return "text-[#eb3b3b]"
  }

  return "text-[#888888]"
}

/**
 * Renders paginated job run history with selectable run inspection, so operators can inspect
 * execution outcomes and raw model output without leaving the task detail surface.
 */
export const JobRunsPanel = ({ jobId, runs, selectedRun, runsAvailable }: JobRunsPanelProps) => {
  const hasPreviousPage = runs.offset > 0
  const nextOffset = runs.offset + runs.limit
  const hasNextPage = nextOffset < runs.total
  const previousOffset = Math.max(0, runs.offset - runs.limit)

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-[rgba(26,26,26,0.08)] bg-white">
        <header className="flex items-center justify-between border-b border-[rgba(26,26,26,0.08)] px-4 py-3">
          <div>
            <h2 className="m-0 text-lg font-medium text-[#1a1a1a]">Run History</h2>
            <p className="m-0 mt-1 font-mono text-xs tracking-[0.08em] text-[#888888] uppercase">
              {runs.total} total runs
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to={{ pathname: `/jobs/${jobId}`, search: buildSearch(previousOffset) }}
              aria-disabled={!hasPreviousPage}
              className={!hasPreviousPage ? "pointer-events-none" : undefined}
            >
              <Button variant="outline" size="sm" disabled={!hasPreviousPage}>
                Prev
              </Button>
            </Link>
            <Link
              to={{ pathname: `/jobs/${jobId}`, search: buildSearch(nextOffset) }}
              aria-disabled={!hasNextPage}
              className={!hasNextPage ? "pointer-events-none" : undefined}
            >
              <Button variant="outline" size="sm" disabled={!hasNextPage}>
                Next
              </Button>
            </Link>
          </div>
        </header>

        <div className="divide-y divide-[rgba(26,26,26,0.08)]">
          {!runsAvailable ? (
            <p className="m-0 px-4 py-6 text-sm text-[#888888]">
              Run history is temporarily unavailable from runtime.
            </p>
          ) : runs.runs.length === 0 ? (
            <p className="m-0 px-4 py-6 text-sm text-[#888888]">
              No runs recorded for this job yet.
            </p>
          ) : (
            runs.runs.map((run) => {
              const isSelected = selectedRun?.id === run.id

              return (
                <Link
                  key={run.id}
                  to={{ pathname: `/jobs/${jobId}`, search: buildSearch(runs.offset, run.id) }}
                  className={
                    isSelected
                      ? "block bg-[rgba(26,26,26,0.05)] px-4 py-3"
                      : "block px-4 py-3 transition-colors hover:bg-[rgba(26,26,26,0.03)]"
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="m-0 font-mono text-xs tracking-[0.08em] text-[#888888] uppercase">
                        Run {run.id}
                      </p>
                      <p className="m-0 mt-1 text-sm text-[#1a1a1a]">
                        Started {formatDateTime(run.startedAt)}
                      </p>
                    </div>
                    <p
                      className={`m-0 font-mono text-xs uppercase ${resolveRunStatusClass(run.status)}`}
                    >
                      {run.status}
                    </p>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-[#888888]">
                    <span>Duration: {formatDuration(run.startedAt, run.finishedAt)}</span>
                    <span>{run.errorCode ? `Error: ${run.errorCode}` : "No error code"}</span>
                  </div>
                </Link>
              )
            })
          )}
        </div>
      </div>

      <div className="rounded-lg border border-[rgba(26,26,26,0.08)] bg-white p-4">
        <h3 className="m-0 text-sm font-medium text-[#1a1a1a]">Selected Run Detail</h3>

        {selectedRun ? (
          <div className="mt-3 space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <p className="m-0 font-mono text-xs tracking-[0.08em] text-[#888888] uppercase">
                  Run id
                </p>
                <p className="m-0 mt-1 break-all text-sm text-[#1a1a1a]">{selectedRun.id}</p>
              </div>
              <div>
                <p className="m-0 font-mono text-xs tracking-[0.08em] text-[#888888] uppercase">
                  Status
                </p>
                <p className={`m-0 mt-1 text-sm ${resolveRunStatusClass(selectedRun.status)}`}>
                  {selectedRun.status}
                </p>
              </div>
              <div>
                <p className="m-0 font-mono text-xs tracking-[0.08em] text-[#888888] uppercase">
                  Started
                </p>
                <p className="m-0 mt-1 text-sm text-[#1a1a1a]">
                  {formatDateTime(selectedRun.startedAt)}
                </p>
              </div>
              <div>
                <p className="m-0 font-mono text-xs tracking-[0.08em] text-[#888888] uppercase">
                  Finished
                </p>
                <p className="m-0 mt-1 text-sm text-[#1a1a1a]">
                  {formatDateTime(selectedRun.finishedAt)}
                </p>
              </div>
            </div>

            <div>
              <p className="m-0 mb-2 font-mono text-xs tracking-[0.08em] text-[#888888] uppercase">
                Return Payload
              </p>
              <pre className="hide-scrollbar m-0 max-h-52 overflow-auto rounded-lg border border-[rgba(26,26,26,0.08)] bg-[rgba(248,248,248,0.8)] p-3 font-mono text-xs text-[#555555] whitespace-pre-wrap">
                {formatResultJson(selectedRun.resultJson)}
              </pre>
            </div>

            <div>
              <p className="m-0 mb-2 font-mono text-xs tracking-[0.08em] text-[#888888] uppercase">
                Raw LLM Output
              </p>
              <pre className="hide-scrollbar m-0 max-h-52 overflow-auto rounded-lg border border-[rgba(26,26,26,0.08)] bg-[rgba(248,248,248,0.8)] p-3 font-mono text-xs text-[#555555] whitespace-pre-wrap">
                {extractRawLlmOutput(selectedRun.resultJson) ??
                  "No raw LLM output captured for this run."}
              </pre>
            </div>
          </div>
        ) : (
          <p className="m-0 mt-3 text-sm text-[#888888]">
            Select a run from history to inspect payload, outputs, and errors.
          </p>
        )}
      </div>
    </section>
  )
}
