import { useEffect, useMemo, useState } from "react"
import { Link, useLoaderData, useNavigation } from "react-router"

import { JobsGroupCard } from "../components/jobs/jobs-group-card.js"
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card.js"
import { Switch } from "../components/ui/switch.js"
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
  const navigation = useNavigation()
  const isLoading = navigation.state !== "idle"
  const loaderNow = data.status === "success" ? data.now : Date.now()

  const [searchQuery, setSearchQuery] = useState("")
  const [preferences, setPreferences] = useState<JobsViewPreferences | null>(null)
  const [referenceNow, setReferenceNow] = useState(loaderNow)

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

  if (data.status === "error") {
    return (
      <section className="mx-auto flex h-[calc(100dvh-4.5rem)] w-full max-w-5xl flex-col px-2 pb-6 pt-16">
        <header className="mb-8 border-b border-[rgba(26,26,26,0.08)] pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="m-0 text-4xl leading-none font-light text-[#1a1a1a]">Job Queue</h1>
              <p className="mt-2 mb-0 font-mono text-sm text-[#888888]">Runtime unavailable</p>
            </div>
            <Link
              to="/"
              className="self-start font-mono text-xs tracking-[0.12em] text-[#888888] uppercase transition-colors hover:text-[#1a1a1a] sm:self-auto"
            >
              ESC / Back
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

  return (
    <section className="mx-auto flex h-[calc(100dvh-4.5rem)] w-full max-w-5xl flex-col px-2 pb-6 pt-16">
      <header className="mb-6 border-b border-[rgba(26,26,26,0.08)] pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="m-0 text-4xl leading-none font-light text-[#1a1a1a]">Job Queue</h1>
            <p className="mt-2 mb-0 whitespace-nowrap font-mono text-xs text-[#888888]">
              {activeCount} Active • {scheduledCount} Scheduled • {stoppedCount} Stopped
            </p>
          </div>
          <Link
            to="/"
            className="self-start font-mono text-xs tracking-[0.12em] text-[#888888] uppercase transition-colors hover:text-[#1a1a1a] sm:self-auto"
          >
            ESC / Back
          </Link>
        </div>
      </header>

      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-[1fr_auto_auto] md:items-center md:gap-3">
        <label className="col-span-2 flex items-center gap-2 rounded-xl border border-[rgba(26,26,26,0.08)] bg-white px-3 py-2.5 md:col-span-1">
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

        <Switch
          checked={activePreferences.hideFinishedJobs}
          onCheckedChange={(checked) =>
            setPreferences((current) => ({
              ...(current ?? defaultJobsViewPreferences),
              hideFinishedJobs: checked,
            }))
          }
          label="Hide finished"
          className="min-h-[44px] gap-2 px-2"
        />

        <Switch
          checked={activePreferences.showSystemJobs}
          onCheckedChange={(checked) =>
            setPreferences((current) => ({
              ...(current ?? defaultJobsViewPreferences),
              showSystemJobs: checked,
            }))
          }
          label="Show system"
          className="min-h-[44px] gap-2 px-2"
        />
      </div>

      {isLoading ? <p className="mb-3 mt-0 text-xs text-[#888888]">Refreshing jobs...</p> : null}

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
        <div className="hide-scrollbar grid flex-1 gap-4 overflow-y-auto pr-2">
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
