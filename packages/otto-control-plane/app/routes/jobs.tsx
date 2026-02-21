import { useLoaderData, useNavigation } from "react-router"

import { CommandBar } from "../components/command/command-bar.js"
import { JobsGroupCard } from "../components/jobs/jobs-group-card.js"
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card.js"
import type { ExternalJobListItem } from "../features/jobs/contracts.js"
import { createOttoExternalApiClientFromEnvironment } from "../server/otto-external-api.server.js"

type JobsRouteLoaderData =
  | {
      status: "success"
      jobs: ExternalJobListItem[]
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

  if (data.status === "error") {
    return (
      <section className="rounded-[24px] border border-[rgba(26,26,26,0.08)] bg-[rgba(255,255,255,0.74)] p-[26px] backdrop-blur-[8px] max-[720px]:p-[18px]">
        <CommandBar
          placeholder="Type a command (Jobs read surface)"
          entries={[
            { label: "Home", to: "/" },
            { label: "Jobs", to: "/jobs" },
          ]}
        />
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

  const systemJobs = data.jobs.filter((job) => job.managedBy === "system")
  const operatorJobs = data.jobs.filter((job) => job.managedBy === "operator")
  const hasJobs = data.jobs.length > 0

  return (
    <section className="rounded-[24px] border border-[rgba(26,26,26,0.08)] bg-[rgba(255,255,255,0.74)] p-[26px] backdrop-blur-[8px] max-[720px]:p-[18px]">
      <header className="mb-4">
        <p className="m-0 font-mono text-[11px] tracking-[0.12em] text-[#888888] uppercase">Jobs</p>
        <h1 className="mt-1 mb-0 text-3xl leading-none font-light">Scheduled Tasks</h1>
      </header>

      <CommandBar
        placeholder="Type a command (Jobs read surface)"
        entries={[
          { label: "Home", to: "/" },
          { label: "Jobs", to: "/jobs" },
        ]}
      />

      {isLoading ? <p className="mb-3 mt-0 text-xs text-[#888888]">Refreshing jobs...</p> : null}

      {!hasJobs ? (
        <Card>
          <CardHeader>
            <CardTitle>No jobs found</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="m-0 text-sm text-[#888888]">
              Otto has no scheduled jobs yet. System jobs appear here after runtime initialization.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          <JobsGroupCard
            title="System-managed jobs"
            description="Read-only runtime automation"
            emptyMessage="No system jobs detected."
            jobs={systemJobs}
          />
          <JobsGroupCard
            title="Operator-managed jobs"
            description="Jobs you can control in upcoming tickets"
            emptyMessage="No operator jobs yet."
            jobs={operatorJobs}
          />
        </div>
      )}
    </section>
  )
}
