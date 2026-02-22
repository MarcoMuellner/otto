import { useEffect, useState, type FormEvent } from "react"
import { Link, useLoaderData, useNavigate, useNavigation, useRevalidator } from "react-router"
import { toast } from "sonner"

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

type JobScheduleType = "recurring" | "oneshot"

type JobEditFormState = {
  type: string
  scheduleType: JobScheduleType
  cadenceMinutes: string
  runAt: string
  profileId: string
  payloadText: string
}

type MutationFeedback = {
  kind: "success" | "error"
  message: string
}

const systemReservedJobTypes = new Set(["heartbeat", "watchdog_failures"])

const isSystemReservedJobType = (type: string): boolean => {
  return systemReservedJobTypes.has(type.trim().toLowerCase())
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

const formatEpochToDateTimeLocal = (value: number | null): string => {
  if (value == null) {
    return ""
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ""
  }

  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

const parseDateTimeLocalToEpoch = (value: string): number | null => {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return null
  }

  const timestamp = new Date(trimmed).getTime()
  if (!Number.isFinite(timestamp)) {
    return null
  }

  return Math.trunc(timestamp)
}

const buildEditFormStateFromJob = (job: ExternalJobDetail): JobEditFormState => {
  let payloadText = ""
  if (job.payload) {
    try {
      payloadText = JSON.stringify(JSON.parse(job.payload) as unknown, null, 2)
    } catch {
      payloadText = job.payload
    }
  }

  return {
    type: job.type,
    scheduleType: job.scheduleType,
    cadenceMinutes: job.cadenceMinutes == null ? "" : String(job.cadenceMinutes),
    runAt: formatEpochToDateTimeLocal(job.runAt),
    profileId: job.profileId ?? "",
    payloadText,
  }
}

const parseMutationResponse = async (
  response: Response
): Promise<{ message: string; body: unknown }> => {
  let body: unknown = null
  try {
    body = (await response.json()) as unknown
  } catch {
    body = null
  }

  if (response.ok) {
    return {
      message: "ok",
      body,
    }
  }

  if (body && typeof body === "object") {
    const candidate = body as {
      message?: unknown
      error?: unknown
    }

    if (typeof candidate.message === "string" && candidate.message.trim().length > 0) {
      return {
        message: candidate.message,
        body,
      }
    }

    if (typeof candidate.error === "string" && candidate.error.trim().length > 0) {
      return {
        message: candidate.error,
        body,
      }
    }
  }

  return {
    message: "Request failed",
    body,
  }
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
  const navigate = useNavigate()
  const navigation = useNavigation()
  const revalidator = useRevalidator()
  const isLoading = navigation.state !== "idle"
  const loaderNow = data.status === "success" ? data.now : Date.now()
  const [referenceNow, setReferenceNow] = useState(loaderNow)
  const [isInfoPanelOpen, setIsInfoPanelOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isCancelOpen, setIsCancelOpen] = useState(false)
  const [editFormState, setEditFormState] = useState<JobEditFormState | null>(null)
  const [cancelReason, setCancelReason] = useState("")
  const [isMutating, setIsMutating] = useState(false)
  const [mutationFeedback, setMutationFeedback] = useState<MutationFeedback | null>(null)
  const displayTitle =
    data.status === "success" ? getJobDisplayTitle(data.job.type) : "Task inspection"

  useEffect(() => {
    if (data.status !== "success") {
      return
    }

    setEditFormState(buildEditFormStateFromJob(data.job))
  }, [data])

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

  const submitRunNow = async () => {
    if (data.status !== "success" || isMutating || !data.job.isMutable) {
      return
    }

    setIsMutating(true)
    setMutationFeedback(null)

    try {
      const response = await fetch(`/api/jobs/${encodeURIComponent(data.job.id)}/run-now`, {
        method: "POST",
      })
      const outcome = await parseMutationResponse(response)

      if (!response.ok) {
        toast.error(outcome.message)
        return
      }

      toast.success("Run-now accepted. Scheduler will pick it up immediately.")
      revalidator.revalidate()
    } catch {
      toast.error("Could not reach the control plane API.")
    } finally {
      setIsMutating(false)
    }
  }

  const submitUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (data.status !== "success" || isMutating || !data.job.isMutable || !editFormState) {
      return
    }

    const type = editFormState.type.trim()
    if (type.length === 0) {
      setMutationFeedback({
        kind: "error",
        message: "Type is required.",
      })
      return
    }

    if (isSystemReservedJobType(type)) {
      setMutationFeedback({
        kind: "error",
        message: "This job type is system-reserved and cannot be set from control plane.",
      })
      return
    }

    const payload: Record<string, unknown> = {
      type,
      scheduleType: editFormState.scheduleType,
    }

    if (editFormState.scheduleType === "recurring") {
      const cadence = Number(editFormState.cadenceMinutes)
      if (!Number.isInteger(cadence) || cadence < 1) {
        setMutationFeedback({
          kind: "error",
          message: "Cadence must be a positive whole number.",
        })
        return
      }

      payload.cadenceMinutes = cadence
    } else {
      const runAt = parseDateTimeLocalToEpoch(editFormState.runAt)
      if (runAt === null) {
        setMutationFeedback({
          kind: "error",
          message: "Run at is required for one-shot jobs.",
        })
        return
      }

      payload.runAt = runAt
      payload.cadenceMinutes = null
    }

    const trimmedProfileId = editFormState.profileId.trim()
    payload.profileId = trimmedProfileId.length === 0 ? null : trimmedProfileId

    const payloadText = editFormState.payloadText.trim()
    if (payloadText.length === 0) {
      payload.payload = null
    } else {
      try {
        const parsed = JSON.parse(payloadText) as unknown
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("payload-not-object")
        }

        payload.payload = parsed
      } catch {
        setMutationFeedback({
          kind: "error",
          message: "Payload must be a valid JSON object.",
        })
        return
      }
    }

    setIsMutating(true)
    setMutationFeedback(null)

    try {
      const response = await fetch(`/api/jobs/${encodeURIComponent(data.job.id)}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      })
      const outcome = await parseMutationResponse(response)

      if (!response.ok) {
        setMutationFeedback({
          kind: "error",
          message: outcome.message,
        })
        return
      }

      setMutationFeedback({
        kind: "success",
        message: "Job updated.",
      })
      window.location.reload()
    } catch {
      setMutationFeedback({
        kind: "error",
        message: "Could not reach the control plane API.",
      })
    } finally {
      setIsMutating(false)
    }
  }

  const submitCancel = async () => {
    if (data.status !== "success" || isMutating || !data.job.isMutable) {
      return
    }

    setIsMutating(true)
    setMutationFeedback(null)

    try {
      const response = await fetch(`/api/jobs/${encodeURIComponent(data.job.id)}`, {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          reason: cancelReason.trim().length > 0 ? cancelReason.trim() : undefined,
        }),
      })
      const outcome = await parseMutationResponse(response)

      if (!response.ok) {
        setMutationFeedback({
          kind: "error",
          message: outcome.message,
        })
        return
      }

      navigate("/jobs")
    } catch {
      setMutationFeedback({
        kind: "error",
        message: "Could not reach the control plane API.",
      })
    } finally {
      setIsMutating(false)
    }
  }

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
            <div className="min-h-0 space-y-4 xl:col-span-2">
              <Card>
                <CardHeader className="pb-1">
                  <CardTitle>Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 pt-1 pb-3">
                  {!data.job.isMutable ? (
                    <p className="m-0 text-sm text-[#888888]">
                      This is a system-managed job and cannot be edited, cancelled, or run-now.
                    </p>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="px-2 py-1.5 text-[10px] tracking-[0.06em] sm:px-3 sm:py-2 sm:text-xs sm:tracking-[0.09em]"
                          onClick={() => void submitRunNow()}
                          disabled={isMutating}
                        >
                          {isMutating ? "Working..." : "Run Now"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="px-2 py-1.5 text-[10px] tracking-[0.06em] sm:px-3 sm:py-2 sm:text-xs sm:tracking-[0.09em]"
                          onClick={() => {
                            setMutationFeedback(null)
                            setIsEditOpen((current) => !current)
                          }}
                          disabled={isMutating}
                        >
                          {isEditOpen ? "Close Edit" : "Edit Job"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="px-2 py-1.5 text-[10px] tracking-[0.06em] sm:px-3 sm:py-2 sm:text-xs sm:tracking-[0.09em]"
                          onClick={() => {
                            setMutationFeedback(null)
                            setIsCancelOpen((current) => !current)
                          }}
                          disabled={isMutating}
                        >
                          {isCancelOpen ? "Close Cancel" : "Cancel Job"}
                        </Button>
                      </div>

                      {isEditOpen && editFormState ? (
                        <form className="grid gap-3" onSubmit={submitUpdate}>
                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="grid gap-1">
                              <label
                                htmlFor="edit-type"
                                className="text-xs font-mono text-[#666666] uppercase"
                              >
                                Type
                              </label>
                              <input
                                id="edit-type"
                                value={editFormState.type}
                                onChange={(event) =>
                                  setEditFormState((current) =>
                                    current ? { ...current, type: event.target.value } : current
                                  )
                                }
                                className="rounded-lg border border-[rgba(26,26,26,0.14)] bg-white px-3 py-2 text-sm text-[#1a1a1a]"
                              />
                            </div>

                            <div className="grid gap-1">
                              <label
                                htmlFor="edit-profile-id"
                                className="text-xs font-mono text-[#666666] uppercase"
                              >
                                Profile ID
                              </label>
                              <input
                                id="edit-profile-id"
                                value={editFormState.profileId}
                                onChange={(event) =>
                                  setEditFormState((current) =>
                                    current
                                      ? { ...current, profileId: event.target.value }
                                      : current
                                  )
                                }
                                className="rounded-lg border border-[rgba(26,26,26,0.14)] bg-white px-3 py-2 text-sm text-[#1a1a1a]"
                              />
                            </div>
                          </div>

                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="grid gap-1">
                              <label
                                htmlFor="edit-schedule-type"
                                className="text-xs font-mono text-[#666666] uppercase"
                              >
                                Schedule Type
                              </label>
                              <select
                                id="edit-schedule-type"
                                value={editFormState.scheduleType}
                                onChange={(event) =>
                                  setEditFormState((current) =>
                                    current
                                      ? {
                                          ...current,
                                          scheduleType: event.target.value as JobScheduleType,
                                        }
                                      : current
                                  )
                                }
                                className="rounded-lg border border-[rgba(26,26,26,0.14)] bg-white px-3 py-2 text-sm text-[#1a1a1a]"
                              >
                                <option value="recurring">Recurring</option>
                                <option value="oneshot">One-shot</option>
                              </select>
                            </div>

                            {editFormState.scheduleType === "recurring" ? (
                              <div className="grid gap-1">
                                <label
                                  htmlFor="edit-cadence"
                                  className="text-xs font-mono text-[#666666] uppercase"
                                >
                                  Cadence Minutes
                                </label>
                                <input
                                  id="edit-cadence"
                                  type="number"
                                  min={1}
                                  step={1}
                                  value={editFormState.cadenceMinutes}
                                  onChange={(event) =>
                                    setEditFormState((current) =>
                                      current
                                        ? {
                                            ...current,
                                            cadenceMinutes: event.target.value,
                                          }
                                        : current
                                    )
                                  }
                                  className="rounded-lg border border-[rgba(26,26,26,0.14)] bg-white px-3 py-2 text-sm text-[#1a1a1a]"
                                />
                              </div>
                            ) : (
                              <div className="grid gap-1">
                                <label
                                  htmlFor="edit-run-at"
                                  className="text-xs font-mono text-[#666666] uppercase"
                                >
                                  Run At
                                </label>
                                <input
                                  id="edit-run-at"
                                  type="datetime-local"
                                  value={editFormState.runAt}
                                  onChange={(event) =>
                                    setEditFormState((current) =>
                                      current
                                        ? {
                                            ...current,
                                            runAt: event.target.value,
                                          }
                                        : current
                                    )
                                  }
                                  className="rounded-lg border border-[rgba(26,26,26,0.14)] bg-white px-3 py-2 text-sm text-[#1a1a1a]"
                                />
                              </div>
                            )}
                          </div>

                          <div className="grid gap-1">
                            <label
                              htmlFor="edit-payload"
                              className="text-xs font-mono text-[#666666] uppercase"
                            >
                              Payload JSON
                            </label>
                            <textarea
                              id="edit-payload"
                              rows={4}
                              value={editFormState.payloadText}
                              onChange={(event) =>
                                setEditFormState((current) =>
                                  current
                                    ? {
                                        ...current,
                                        payloadText: event.target.value,
                                      }
                                    : current
                                )
                              }
                              className="rounded-lg border border-[rgba(26,26,26,0.14)] bg-white px-3 py-2 font-mono text-xs text-[#1a1a1a]"
                            />
                          </div>

                          <div className="flex justify-end">
                            <Button type="submit" disabled={isMutating}>
                              {isMutating ? "Saving..." : "Save Changes"}
                            </Button>
                          </div>
                        </form>
                      ) : null}

                      {isCancelOpen ? (
                        <div className="grid gap-2 rounded-xl border border-[rgba(26,26,26,0.12)] bg-[rgba(26,26,26,0.02)] p-3">
                          <p className="m-0 text-sm text-[#555555]">
                            This will stop the job and mark it cancelled.
                          </p>
                          <input
                            id="cancel-reason"
                            value={cancelReason}
                            onChange={(event) => setCancelReason(event.target.value)}
                            placeholder="Optional reason"
                            className="rounded-lg border border-[rgba(26,26,26,0.18)] bg-white px-3 py-2 text-sm text-[#1a1a1a]"
                          />
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setIsCancelOpen(false)
                              }}
                              disabled={isMutating}
                            >
                              Never Mind
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="border-[rgba(180,35,24,0.35)] text-[#7a271a] hover:bg-[rgba(180,35,24,0.08)]"
                              onClick={() => void submitCancel()}
                              disabled={isMutating}
                            >
                              {isMutating ? "Cancelling..." : "Confirm Cancel"}
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </>
                  )}

                  {mutationFeedback ? (
                    <p
                      className={
                        mutationFeedback.kind === "success"
                          ? "m-0 text-sm text-[#0f7b3a]"
                          : "m-0 text-sm text-[#b42318]"
                      }
                    >
                      {mutationFeedback.message}
                    </p>
                  ) : null}
                </CardContent>
              </Card>

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
