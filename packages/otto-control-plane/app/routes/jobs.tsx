import { useEffect, useMemo, useState, type FormEvent } from "react"
import { Link, useLoaderData, useNavigate, useNavigation } from "react-router"

import { JobsGroupCard } from "../components/jobs/jobs-group-card.js"
import { Button } from "../components/ui/button.js"
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card.js"
import { Switch } from "../components/ui/switch.js"
import { modelCatalogResponseSchema } from "../features/models/contracts.js"
import type { ExternalJobListItem } from "../features/jobs/contracts.js"
import { getJobDisplayTitle } from "../features/jobs/presentation.js"
import {
  createJobsViewPreferencesStore,
  defaultJobsViewPreferences,
  type JobsViewPreferences,
} from "../features/jobs/view-preferences.js"
import { createOttoExternalApiClientFromEnvironment } from "../server/otto-external-api.server.js"

type JobsRouteLoaderData =
  | {
      status: "success"
      jobs: ExternalJobListItem[]
      now: number
    }
  | {
      status: "error"
      message: string
    }

type CreateJobScheduleType = "recurring" | "oneshot"

type CreateJobFormState = {
  id: string
  type: string
  scheduleType: CreateJobScheduleType
  modelRef: string
  cadenceMinutes: string
  runAt: string
  profileId: string
  payloadText: string
}

type MutationFeedback = {
  kind: "success" | "error"
  message: string
}

const INHERIT_MODEL_OPTION = "__INHERIT__"

const defaultCreateJobFormState: CreateJobFormState = {
  id: "",
  type: "operator-task",
  scheduleType: "recurring",
  modelRef: INHERIT_MODEL_OPTION,
  cadenceMinutes: "5",
  runAt: "",
  profileId: "",
  payloadText: "",
}

const systemReservedJobTypes = new Set(["heartbeat", "watchdog_failures"])

const isSystemReservedJobType = (type: string): boolean => {
  return systemReservedJobTypes.has(type.trim().toLowerCase())
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

const parseDateTimeLocalToEpoch = (value: string): number | null => {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return null
  }

  const parsed = new Date(trimmed)
  const timestamp = parsed.getTime()
  if (!Number.isFinite(timestamp)) {
    return null
  }

  return Math.trunc(timestamp)
}
export const loader = async (): Promise<JobsRouteLoaderData> => {
  try {
    const client = await createOttoExternalApiClientFromEnvironment()
    const response = await client.listJobs()
    return {
      status: "success",
      jobs: response.jobs,
      now: Date.now(),
    }
  } catch {
    return {
      status: "error",
      message: "Could not load jobs right now. Check runtime availability.",
    }
  }
}

export default function JobsRoute() {
  const data = useLoaderData<typeof loader>()
  const navigate = useNavigate()
  const navigation = useNavigation()
  const isLoading = navigation.state !== "idle"
  const loaderNow = data.status === "success" ? data.now : Date.now()

  const [searchQuery, setSearchQuery] = useState("")
  const [preferences, setPreferences] = useState<JobsViewPreferences | null>(null)
  const [referenceNow, setReferenceNow] = useState(loaderNow)
  const [isCreatePanelOpen, setIsCreatePanelOpen] = useState(false)
  const [createFormState, setCreateFormState] =
    useState<CreateJobFormState>(defaultCreateJobFormState)
  const [createFeedback, setCreateFeedback] = useState<MutationFeedback | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [catalogModels, setCatalogModels] = useState<string[]>([])
  const [catalogError, setCatalogError] = useState<string | null>(null)

  const preferencesStore = useMemo(() => {
    if (typeof window === "undefined") {
      return createJobsViewPreferencesStore(null)
    }

    return createJobsViewPreferencesStore(window.localStorage)
  }, [])

  useEffect(() => {
    setPreferences(preferencesStore.load())
  }, [preferencesStore])

  useEffect(() => {
    if (!preferences) {
      return
    }

    preferencesStore.save(preferences)
  }, [preferences, preferencesStore])

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
    let cancelled = false

    const loadCatalog = async () => {
      try {
        const response = await fetch("/api/models/catalog", {
          method: "GET",
        })
        const body = await response.json()
        if (!response.ok) {
          throw new Error(
            typeof body?.message === "string" ? body.message : "Could not load model catalog"
          )
        }

        const parsed = modelCatalogResponseSchema.parse(body)
        if (!cancelled) {
          setCatalogModels(parsed.models)
          setCatalogError(null)
        }
      } catch (error) {
        if (!cancelled) {
          setCatalogModels([])
          setCatalogError(error instanceof Error ? error.message : "Could not load model catalog")
        }
      }
    }

    void loadCatalog()

    return () => {
      cancelled = true
    }
  }, [])

  if (data.status === "error") {
    return (
      <section className="mx-auto flex min-h-[calc(100dvh-4.5rem)] w-full max-w-5xl flex-col px-2 pb-6 pt-16 max-[720px]:px-1 max-[720px]:pb-4 max-[720px]:pt-2">
        <header className="mb-4 border-b border-[rgba(26,26,26,0.08)] pb-3 md:mb-8 md:pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="m-0 text-4xl leading-none font-light text-[#1a1a1a] max-[720px]:text-[2rem]">
                Job Queue
              </h1>
              <p className="mt-2 mb-0 font-mono text-xs text-[#888888]">Runtime unavailable</p>
            </div>
            <Link to="/" className="inline-flex self-start sm:self-auto">
              <Button variant="outline" size="sm" className="h-10 gap-1.5 px-3">
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
                Back
              </Button>
            </Link>
          </div>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Jobs unavailable</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="m-0 text-sm text-[#888888]">{data.message}</p>
          </CardContent>
        </Card>
      </section>
    )
  }

  const activePreferences = preferences ?? defaultJobsViewPreferences
  const normalizedQuery = searchQuery.trim().toLowerCase()
  const hasSearchQuery = normalizedQuery.length > 0

  const activeCount = data.jobs.filter(
    (job) => job.terminalState === null && job.status === "running"
  ).length
  const scheduledCount = data.jobs.filter(
    (job) => job.terminalState === null && job.status !== "running"
  ).length
  const stoppedCount = data.jobs.filter((job) => job.terminalState !== null).length

  const filteredJobs = data.jobs.filter((job) => {
    if (activePreferences.hideFinishedJobs && job.terminalState !== null) {
      return false
    }

    if (!activePreferences.showSystemJobs && job.managedBy === "system") {
      return false
    }

    if (!hasSearchQuery) {
      return true
    }

    const haystack = `${getJobDisplayTitle(job.type)} ${job.type} ${job.id}`.toLowerCase()
    return haystack.includes(normalizedQuery)
  })

  const operatorJobs = filteredJobs.filter((job) => job.managedBy === "operator")
  const systemJobs = filteredJobs.filter((job) => job.managedBy === "system")
  const hasVisibleJobs = filteredJobs.length > 0

  const handleCreateSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isCreating) {
      return
    }

    const type = createFormState.type.trim()
    if (type.length === 0) {
      setCreateFeedback({
        kind: "error",
        message: "Type is required.",
      })
      return
    }

    if (isSystemReservedJobType(type)) {
      setCreateFeedback({
        kind: "error",
        message: "This job type is system-reserved and cannot be created from control plane.",
      })
      return
    }

    const payload: Record<string, unknown> = {
      type,
      scheduleType: createFormState.scheduleType,
      modelRef: createFormState.modelRef === INHERIT_MODEL_OPTION ? null : createFormState.modelRef,
    }

    const id = createFormState.id.trim()
    if (id.length > 0) {
      payload.id = id
    }

    if (createFormState.scheduleType === "recurring") {
      const cadence = Number(createFormState.cadenceMinutes)
      if (!Number.isInteger(cadence) || cadence < 1) {
        setCreateFeedback({
          kind: "error",
          message: "Cadence must be a positive whole number.",
        })
        return
      }

      payload.cadenceMinutes = cadence
    } else {
      const runAt = parseDateTimeLocalToEpoch(createFormState.runAt)
      if (runAt === null) {
        setCreateFeedback({
          kind: "error",
          message: "Run at is required for one-shot jobs.",
        })
        return
      }

      payload.runAt = runAt
    }

    const profileId = createFormState.profileId.trim()
    if (profileId.length > 0) {
      payload.profileId = profileId
    }

    const rawPayloadText = createFormState.payloadText.trim()
    if (rawPayloadText.length > 0) {
      try {
        const parsed = JSON.parse(rawPayloadText) as unknown
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("payload-not-object")
        }

        payload.payload = parsed
      } catch {
        setCreateFeedback({
          kind: "error",
          message: "Payload must be a valid JSON object.",
        })
        return
      }
    }

    setIsCreating(true)
    setCreateFeedback(null)

    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      })

      const outcome = await parseMutationResponse(response)
      if (!response.ok) {
        setCreateFeedback({
          kind: "error",
          message: outcome.message,
        })
        return
      }

      const responseBody = outcome.body as { id?: unknown } | null
      const createdId = typeof responseBody?.id === "string" ? responseBody.id : null

      setCreateFeedback({
        kind: "success",
        message: "Job created.",
      })

      if (createdId) {
        navigate(`/jobs/${encodeURIComponent(createdId)}`)
        return
      }

      window.location.reload()
    } catch {
      setCreateFeedback({
        kind: "error",
        message: "Could not reach the control plane API.",
      })
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <section className="mx-auto flex min-h-[calc(100dvh-4.5rem)] w-full max-w-5xl flex-col px-2 pb-6 pt-16 max-[720px]:px-1 max-[720px]:pb-4 max-[720px]:pt-2">
      <header className="mb-4 border-b border-[rgba(26,26,26,0.08)] pb-3 md:mb-6 md:pb-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <h1 className="m-0 text-4xl leading-none font-light text-[#1a1a1a] max-[720px]:text-[2rem]">
              Job Queue
            </h1>
            <p className="mt-2 mb-0 whitespace-nowrap font-mono text-[11px] text-[#888888]">
              {activeCount} Active • {scheduledCount} Scheduled • {stoppedCount} Stopped
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/" className="inline-flex">
              <Button variant="outline" size="sm" className="h-10 gap-1.5 px-3">
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
                Back
              </Button>
            </Link>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-10 px-3"
              onClick={() => {
                setCreateFeedback(null)
                setIsCreatePanelOpen((current) => !current)
              }}
            >
              {isCreatePanelOpen ? "Close" : "Create"}
            </Button>
          </div>
        </div>
      </header>

      <div className="mb-3 grid gap-2">
        <label className="flex items-center gap-2 rounded-xl border border-[rgba(26,26,26,0.08)] bg-white px-3 py-2">
          <svg
            className="h-4 w-4 text-[#888888]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M21 21l-4.35-4.35m1.85-5.15a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            id="jobs-search"
            name="jobs-search"
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search jobs..."
            className="w-full border-none bg-transparent p-0 text-sm text-[#1a1a1a] outline-none placeholder:text-[#aaaaaa]"
          />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <Switch
            checked={activePreferences.hideFinishedJobs}
            onCheckedChange={(checked) =>
              setPreferences((current) => ({
                ...(current ?? defaultJobsViewPreferences),
                hideFinishedJobs: checked,
              }))
            }
            label="Hide done"
            size="compact"
          />

          <Switch
            checked={activePreferences.showSystemJobs}
            onCheckedChange={(checked) =>
              setPreferences((current) => ({
                ...(current ?? defaultJobsViewPreferences),
                showSystemJobs: checked,
              }))
            }
            label="System"
            size="compact"
          />
        </div>
      </div>

      {isCreatePanelOpen ? (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Create job</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid gap-3" onSubmit={handleCreateSubmit}>
              <div className="grid gap-1">
                <label htmlFor="create-type" className="text-xs font-mono text-[#666666] uppercase">
                  Type
                </label>
                <input
                  id="create-type"
                  value={createFormState.type}
                  onChange={(event) =>
                    setCreateFormState((current) => ({ ...current, type: event.target.value }))
                  }
                  className="rounded-lg border border-[rgba(26,26,26,0.14)] bg-white px-3 py-2 text-sm text-[#1a1a1a]"
                />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="grid gap-1">
                  <label
                    htmlFor="create-schedule-type"
                    className="text-xs font-mono text-[#666666] uppercase"
                  >
                    Schedule Type
                  </label>
                  <select
                    id="create-schedule-type"
                    value={createFormState.scheduleType}
                    onChange={(event) =>
                      setCreateFormState((current) => ({
                        ...current,
                        scheduleType: event.target.value as CreateJobScheduleType,
                      }))
                    }
                    className="rounded-lg border border-[rgba(26,26,26,0.14)] bg-white px-3 py-2 text-sm text-[#1a1a1a]"
                  >
                    <option value="recurring">Recurring</option>
                    <option value="oneshot">One-shot</option>
                  </select>
                </div>

                {createFormState.scheduleType === "recurring" ? (
                  <div className="grid gap-1">
                    <label
                      htmlFor="create-cadence"
                      className="text-xs font-mono text-[#666666] uppercase"
                    >
                      Cadence Minutes
                    </label>
                    <input
                      id="create-cadence"
                      type="number"
                      min={1}
                      step={1}
                      value={createFormState.cadenceMinutes}
                      onChange={(event) =>
                        setCreateFormState((current) => ({
                          ...current,
                          cadenceMinutes: event.target.value,
                        }))
                      }
                      className="rounded-lg border border-[rgba(26,26,26,0.14)] bg-white px-3 py-2 text-sm text-[#1a1a1a]"
                    />
                  </div>
                ) : (
                  <div className="grid gap-1">
                    <label
                      htmlFor="create-run-at"
                      className="text-xs font-mono text-[#666666] uppercase"
                    >
                      Run At
                    </label>
                    <input
                      id="create-run-at"
                      type="datetime-local"
                      value={createFormState.runAt}
                      onChange={(event) =>
                        setCreateFormState((current) => ({ ...current, runAt: event.target.value }))
                      }
                      className="rounded-lg border border-[rgba(26,26,26,0.14)] bg-white px-3 py-2 text-sm text-[#1a1a1a]"
                    />
                  </div>
                )}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="grid gap-1">
                  <label
                    htmlFor="create-model-ref"
                    className="text-xs font-mono text-[#666666] uppercase"
                  >
                    Model
                  </label>
                  <select
                    id="create-model-ref"
                    value={createFormState.modelRef}
                    onChange={(event) =>
                      setCreateFormState((current) => ({
                        ...current,
                        modelRef: event.target.value,
                      }))
                    }
                    className="rounded-lg border border-[rgba(26,26,26,0.14)] bg-white px-3 py-2 text-sm text-[#1a1a1a]"
                  >
                    <option value={INHERIT_MODEL_OPTION}>inherit scheduled default</option>
                    {catalogModels.map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))}
                  </select>
                  {catalogError ? (
                    <p className="m-0 text-xs text-[#b42318]">{catalogError}</p>
                  ) : null}
                </div>

                <div className="grid gap-1">
                  <label htmlFor="create-id" className="text-xs font-mono text-[#666666] uppercase">
                    Job ID (Optional)
                  </label>
                  <input
                    id="create-id"
                    value={createFormState.id}
                    onChange={(event) =>
                      setCreateFormState((current) => ({ ...current, id: event.target.value }))
                    }
                    className="rounded-lg border border-[rgba(26,26,26,0.14)] bg-white px-3 py-2 text-sm text-[#1a1a1a]"
                  />
                </div>

                <div className="grid gap-1">
                  <label
                    htmlFor="create-profile-id"
                    className="text-xs font-mono text-[#666666] uppercase"
                  >
                    Profile ID (Optional)
                  </label>
                  <input
                    id="create-profile-id"
                    value={createFormState.profileId}
                    onChange={(event) =>
                      setCreateFormState((current) => ({
                        ...current,
                        profileId: event.target.value,
                      }))
                    }
                    className="rounded-lg border border-[rgba(26,26,26,0.14)] bg-white px-3 py-2 text-sm text-[#1a1a1a]"
                  />
                </div>
              </div>

              <div className="grid gap-1">
                <label
                  htmlFor="create-payload"
                  className="text-xs font-mono text-[#666666] uppercase"
                >
                  Payload JSON (Optional)
                </label>
                <textarea
                  id="create-payload"
                  rows={5}
                  value={createFormState.payloadText}
                  onChange={(event) =>
                    setCreateFormState((current) => ({
                      ...current,
                      payloadText: event.target.value,
                    }))
                  }
                  placeholder='{"key":"value"}'
                  className="rounded-lg border border-[rgba(26,26,26,0.14)] bg-white px-3 py-2 font-mono text-xs text-[#1a1a1a]"
                />
              </div>

              {createFeedback ? (
                <p
                  className={
                    createFeedback.kind === "success"
                      ? "m-0 text-sm text-[#0f7b3a]"
                      : "m-0 text-sm text-[#b42318]"
                  }
                >
                  {createFeedback.message}
                </p>
              ) : null}

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setCreateFeedback(null)
                    setCreateFormState(defaultCreateJobFormState)
                  }}
                  disabled={isCreating}
                >
                  Reset
                </Button>
                <Button type="submit" disabled={isCreating}>
                  {isCreating ? "Creating..." : "Create"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {isLoading ? <p className="mb-2 mt-0 text-xs text-[#888888]">Refreshing jobs...</p> : null}

      {!hasVisibleJobs ? (
        <Card>
          <CardHeader>
            <CardTitle>No matching jobs</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="m-0 text-sm text-[#888888]">
              Try clearing the search or toggling filters to reveal more tasks.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 pr-1 md:hide-scrollbar md:flex-1 md:gap-4 md:overflow-y-auto md:pr-2">
          <JobsGroupCard
            title="Operator-managed jobs"
            description="Operator-owned recurring and one-shot jobs"
            emptyMessage="No operator jobs match the current filters."
            jobs={operatorJobs}
            referenceNow={referenceNow}
          />
          {activePreferences.showSystemJobs ? (
            <JobsGroupCard
              title="System-managed jobs"
              description="Read-only runtime automation"
              emptyMessage="No system jobs match the current filters."
              jobs={systemJobs}
              referenceNow={referenceNow}
            />
          ) : null}
        </div>
      )}
    </section>
  )
}
