import { Link } from "react-router"

import type { ExternalJobRun, ExternalJobRunsResponse } from "../../features/jobs/contracts.js"
import { cn } from "../../lib/cn.js"
import { formatDateTime } from "../../lib/date-time.js"
import { Button } from "../ui/button.js"

type JobRunsPanelProps = {
  jobId: string
  runs: ExternalJobRunsResponse
  selectedRun: ExternalJobRun | null
  runsAvailable: boolean
  selectedRunRequested: boolean
}

type ParsedRunResult = {
  structuredStatus: "success" | "failed" | "skipped" | null
  summary: string | null
  errors: Array<{
    code: string
    message: string
  }>
  rawOutput: string | null
  prettyJson: string
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

const parseRunResult = (resultJson: string | null): ParsedRunResult => {
  if (!resultJson) {
    return {
      structuredStatus: null,
      summary: null,
      errors: [],
      rawOutput: null,
      prettyJson: "No result payload captured.",
    }
  }

  const parsed = parseResultJson(resultJson)
  if (typeof parsed === "string") {
    return {
      structuredStatus: null,
      summary: null,
      errors: [],
      rawOutput: parsed,
      prettyJson: parsed,
    }
  }

  if (!parsed || typeof parsed !== "object") {
    return {
      structuredStatus: null,
      summary: null,
      errors: [],
      rawOutput: null,
      prettyJson: JSON.stringify(parsed, null, 2),
    }
  }

  const envelope = parsed as Record<string, unknown>

  const statusValue = envelope.status
  const structuredStatus =
    statusValue === "success" || statusValue === "failed" || statusValue === "skipped"
      ? statusValue
      : null

  const summaryValue = envelope.summary
  const summary =
    typeof summaryValue === "string" && summaryValue.trim().length > 0 ? summaryValue.trim() : null

  const rawOutputValue = envelope.rawOutput
  const rawOutput =
    typeof rawOutputValue === "string" && rawOutputValue.trim().length > 0 ? rawOutputValue : null

  const errors: Array<{ code: string; message: string }> = []
  const errorsValue = envelope.errors
  if (Array.isArray(errorsValue)) {
    for (const entry of errorsValue) {
      if (!entry || typeof entry !== "object") {
        continue
      }

      const errorEntry = entry as Record<string, unknown>
      const code = typeof errorEntry.code === "string" ? errorEntry.code.trim() : ""
      const message = typeof errorEntry.message === "string" ? errorEntry.message.trim() : ""
      if (code.length > 0 && message.length > 0) {
        errors.push({ code, message })
      }
    }
  }

  return {
    structuredStatus,
    summary,
    errors,
    rawOutput,
    prettyJson: JSON.stringify(parsed, null, 2),
  }
}

const formatResultJson = (resultJson: string | null): string => {
  return parseRunResult(resultJson).prettyJson
}

const extractRawLlmOutput = (resultJson: string | null): string | null => {
  return parseRunResult(resultJson).rawOutput
}

const extractSummaryPreview = (resultJson: string | null): string | null => {
  return parseRunResult(resultJson).summary
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

type RunDetailContentProps = {
  run: ExternalJobRun
  parsed: ParsedRunResult
}

const RunDetailContent = ({ run, parsed }: RunDetailContentProps) => {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <p className="m-0 font-mono text-xs tracking-[0.08em] text-[#888888] uppercase">Run id</p>
          <p className="m-0 mt-1 break-all text-sm text-[#1a1a1a]">{run.id}</p>
        </div>
        <div>
          <p className="m-0 font-mono text-xs tracking-[0.08em] text-[#888888] uppercase">Status</p>
          <p className={`m-0 mt-1 text-sm ${resolveRunStatusClass(run.status)}`}>{run.status}</p>
        </div>
        <div>
          <p className="m-0 font-mono text-xs tracking-[0.08em] text-[#888888] uppercase">
            Started
          </p>
          <p className="m-0 mt-1 text-sm text-[#1a1a1a]">{formatDateTime(run.startedAt)}</p>
        </div>
        <div>
          <p className="m-0 font-mono text-xs tracking-[0.08em] text-[#888888] uppercase">
            Finished
          </p>
          <p className="m-0 mt-1 text-sm text-[#1a1a1a]">{formatDateTime(run.finishedAt)}</p>
        </div>
        <div>
          <p className="m-0 font-mono text-xs tracking-[0.08em] text-[#888888] uppercase">
            Duration
          </p>
          <p className="m-0 mt-1 text-sm text-[#1a1a1a]">
            {formatDuration(run.startedAt, run.finishedAt)}
          </p>
        </div>
        <div>
          <p className="m-0 font-mono text-xs tracking-[0.08em] text-[#888888] uppercase">
            Scheduled for
          </p>
          <p className="m-0 mt-1 text-sm text-[#1a1a1a]">{formatDateTime(run.scheduledFor)}</p>
        </div>
      </div>

      <div>
        <p className="m-0 mb-2 font-mono text-xs tracking-[0.08em] text-[#888888] uppercase">
          Execution Summary
        </p>
        <div className="grid grid-cols-1 gap-3 rounded-lg border border-[rgba(26,26,26,0.08)] bg-[rgba(248,248,248,0.7)] p-3 sm:grid-cols-2">
          <div>
            <p className="m-0 font-mono text-[0.65rem] tracking-[0.08em] text-[#888888] uppercase">
              Structured status
            </p>
            <p className="m-0 mt-1 text-sm text-[#1a1a1a]">
              {parsed.structuredStatus ?? run.status}
            </p>
          </div>
          <div>
            <p className="m-0 font-mono text-[0.65rem] tracking-[0.08em] text-[#888888] uppercase">
              Runtime error code
            </p>
            <p className="m-0 mt-1 text-sm text-[#1a1a1a]">{run.errorCode ?? "-"}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="m-0 font-mono text-[0.65rem] tracking-[0.08em] text-[#888888] uppercase">
              Summary
            </p>
            <p className="m-0 mt-1 text-sm text-[#1a1a1a]">
              {parsed.summary ?? run.errorMessage ?? "-"}
            </p>
          </div>
        </div>
      </div>

      <div>
        <p className="m-0 mb-2 font-mono text-xs tracking-[0.08em] text-[#888888] uppercase">
          Structured Errors
        </p>
        {parsed.errors.length > 0 ? (
          <ul className="m-0 space-y-2 rounded-lg border border-[rgba(26,26,26,0.08)] bg-[rgba(248,248,248,0.7)] p-3">
            {parsed.errors.map((error, index) => (
              <li key={`${error.code}-${index}`} className="list-none">
                <p className="m-0 font-mono text-xs text-[#1a1a1a]">{error.code}</p>
                <p className="m-0 mt-1 text-sm text-[#666666]">{error.message}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 rounded-lg border border-[rgba(26,26,26,0.08)] bg-[rgba(248,248,248,0.7)] px-3 py-2 text-sm text-[#888888]">
            No structured errors recorded.
          </p>
        )}
      </div>

      <div>
        <p className="m-0 mb-2 font-mono text-xs tracking-[0.08em] text-[#888888] uppercase">
          Return Payload
        </p>
        <pre className="hide-scrollbar m-0 max-h-52 overflow-auto rounded-lg border border-[rgba(26,26,26,0.08)] bg-[rgba(248,248,248,0.8)] p-3 font-mono text-xs text-[#555555] whitespace-pre-wrap">
          {formatResultJson(run.resultJson)}
        </pre>
      </div>

      <div>
        <p className="m-0 mb-2 font-mono text-xs tracking-[0.08em] text-[#888888] uppercase">
          Raw LLM Output
        </p>
        <pre className="hide-scrollbar m-0 max-h-52 overflow-auto rounded-lg border border-[rgba(26,26,26,0.08)] bg-[rgba(248,248,248,0.8)] p-3 font-mono text-xs text-[#555555] whitespace-pre-wrap">
          {extractRawLlmOutput(run.resultJson) ?? "No raw LLM output captured for this run."}
        </pre>
      </div>
    </div>
  )
}

/**
 * Renders paginated job run history with selectable run inspection, so operators can inspect
 * execution outcomes and raw model output without leaving the task detail surface.
 */
export const JobRunsPanel = ({
  jobId,
  runs,
  selectedRun,
  runsAvailable,
  selectedRunRequested,
}: JobRunsPanelProps) => {
  const hasPreviousPage = runs.offset > 0
  const nextOffset = runs.offset + runs.limit
  const hasNextPage = nextOffset < runs.total
  const previousOffset = Math.max(0, runs.offset - runs.limit)
  const pageStart = runs.total === 0 ? 0 : runs.offset + 1
  const pageEnd = runs.total === 0 ? 0 : Math.min(runs.offset + runs.runs.length, runs.total)
  const selectedRunResult = selectedRun ? parseRunResult(selectedRun.resultJson) : null
  const mobileDetailOpen = selectedRunRequested

  return (
    <section className="h-full min-h-0">
      <div className="flex h-full min-h-0 flex-col rounded-lg border border-[rgba(26,26,26,0.08)] bg-white">
        <header className="flex flex-wrap items-end justify-between gap-3 border-b border-[rgba(26,26,26,0.08)] px-4 py-3">
          <div>
            <h2 className="m-0 text-lg font-medium text-[#1a1a1a]">Run History</h2>
            <p className="m-0 mt-1 font-mono text-xs tracking-[0.08em] text-[#888888] uppercase">
              {runs.total} total runs {runsAvailable ? `• ${pageStart}-${pageEnd}` : ""}
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

        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(0,1.18fr)_minmax(0,0.82fr)]">
          <div className="min-h-0 border-b border-[rgba(26,26,26,0.08)] md:border-r md:border-b-0">
            {!runsAvailable ? (
              <p className="m-0 px-4 py-6 text-sm text-[#888888]">
                Run history is temporarily unavailable from runtime.
              </p>
            ) : runs.runs.length === 0 ? (
              <p className="m-0 px-4 py-6 text-sm text-[#888888]">
                No runs recorded for this job yet.
              </p>
            ) : (
              <div className="hide-scrollbar h-full overflow-y-auto divide-y divide-[rgba(26,26,26,0.08)]">
                {runs.runs.map((run) => {
                  const isSelected = selectedRun?.id === run.id
                  const summaryPreview = extractSummaryPreview(run.resultJson)

                  return (
                    <Link
                      key={run.id}
                      to={{ pathname: `/jobs/${jobId}`, search: buildSearch(runs.offset, run.id) }}
                      className={cn(
                        "block px-4 py-3 transition-colors hover:bg-[rgba(26,26,26,0.03)]",
                        isSelected ? "md:bg-[rgba(26,26,26,0.05)]" : null,
                        isSelected && selectedRunRequested ? "bg-[rgba(26,26,26,0.05)]" : null
                      )}
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

                      {summaryPreview ? (
                        <p className="m-0 mt-2 line-clamp-2 text-sm text-[#666666]">
                          {summaryPreview}
                        </p>
                      ) : null}
                    </Link>
                  )
                })}
              </div>
            )}
          </div>

          <div className="hidden min-h-0 md:block">
            {selectedRun && selectedRunResult ? (
              <div className="hide-scrollbar h-full overflow-y-auto p-4">
                <h3 className="m-0 text-sm font-medium text-[#1a1a1a]">Selected Run Detail</h3>
                <div className="mt-3">
                  <RunDetailContent run={selectedRun} parsed={selectedRunResult} />
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center p-4">
                <p className="m-0 text-center text-sm text-[#888888]">
                  Select a run to inspect payloads, errors, and model output.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div
        className={cn(
          "fixed inset-0 z-40 md:hidden transition-opacity duration-200",
          mobileDetailOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        )}
        aria-hidden={!mobileDetailOpen}
      >
        <Link
          to={{ pathname: `/jobs/${jobId}`, search: buildSearch(runs.offset) }}
          className="absolute inset-0 bg-[rgba(17,17,17,0.34)]"
          aria-label="Close run detail"
        />

        <aside
          className={cn(
            "absolute top-0 right-0 h-full w-[92vw] max-w-[620px] border-l border-[rgba(26,26,26,0.08)] bg-white shadow-2xl transition-transform duration-200",
            mobileDetailOpen ? "translate-x-0" : "translate-x-full"
          )}
        >
          <div className="flex h-full flex-col">
            <header className="flex items-center justify-between border-b border-[rgba(26,26,26,0.08)] px-4 py-3">
              <h3 className="m-0 text-sm font-medium text-[#1a1a1a]">Run Detail</h3>
              <Link
                to={{ pathname: `/jobs/${jobId}`, search: buildSearch(runs.offset) }}
                className="rounded-[10px] border border-[rgba(26,26,26,0.12)] px-3 py-1.5 font-mono text-[0.68rem] tracking-[0.1em] text-[#666666] uppercase"
              >
                Close
              </Link>
            </header>

            <div className="hide-scrollbar flex-1 overflow-y-auto p-4">
              {selectedRun && selectedRunResult ? (
                <RunDetailContent run={selectedRun} parsed={selectedRunResult} />
              ) : (
                <p className="m-0 text-sm text-[#888888]">
                  Run detail is not available for this selection.
                </p>
              )}
            </div>
          </div>
        </aside>
      </div>
    </section>
  )
}
