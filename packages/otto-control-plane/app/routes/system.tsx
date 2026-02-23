import { useEffect, useMemo, useState } from "react"
import { Link, useLoaderData } from "react-router"
import { z } from "zod"

import { formatDateTime } from "../lib/date-time.js"
import { Button } from "../components/ui/button.js"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../components/ui/card.js"
import { createOttoExternalApiClientFromEnvironment } from "../server/otto-external-api.server.js"

const systemStatusSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  checkedAt: z.number().int(),
  runtime: z.object({
    version: z.string().min(1),
    pid: z.number().int(),
    startedAt: z.number().int(),
    uptimeSec: z.number(),
  }),
  services: z.array(
    z.object({
      id: z.string().min(1),
      label: z.string().min(1),
      status: z.enum(["ok", "degraded", "disabled"]),
      message: z.string().min(1),
    })
  ),
})

type SystemStatus = z.infer<typeof systemStatusSchema>

type SystemLoaderData =
  | {
      status: "success"
      snapshot: SystemStatus
    }
  | {
      status: "error"
      message: string
      snapshot: SystemStatus
    }

const createUnavailableSnapshot = (): SystemStatus => {
  return {
    status: "degraded",
    checkedAt: Date.now(),
    runtime: {
      version: "unknown",
      pid: 0,
      startedAt: Date.now(),
      uptimeSec: 0,
    },
    services: [
      {
        id: "runtime",
        label: "Otto Runtime",
        status: "degraded",
        message: "Runtime is unavailable",
      },
    ],
  }
}

export const loader = async (): Promise<SystemLoaderData> => {
  try {
    const client = await createOttoExternalApiClientFromEnvironment()
    const snapshot = await client.getSystemStatus()
    return {
      status: "success",
      snapshot: systemStatusSchema.parse(snapshot),
    }
  } catch {
    return {
      status: "error",
      message: "Could not load runtime status. Retrying is available from this page.",
      snapshot: createUnavailableSnapshot(),
    }
  }
}

const fetchSystemStatus = async (): Promise<SystemStatus> => {
  const response = await fetch("/api/system/status", { method: "GET" })
  const body = await response.json()
  return systemStatusSchema.parse(body)
}

const restartResponseSchema = z.object({
  status: z.literal("accepted"),
  requestedAt: z.number().int(),
  message: z.string().min(1),
})

const requestRuntimeRestart = async (): Promise<z.infer<typeof restartResponseSchema>> => {
  const response = await fetch("/api/system/restart", { method: "POST" })
  const body = await response.json()
  return restartResponseSchema.parse(body)
}

const resolveStatusToneClass = (status: "ok" | "degraded" | "disabled"): string => {
  if (status === "ok") {
    return "text-[#147246]"
  }

  if (status === "disabled") {
    return "text-[#888888]"
  }

  return "text-[#eb3b3b]"
}

const formatUptime = (uptimeSec: number): string => {
  const seconds = Math.max(0, Math.floor(uptimeSec))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainder = seconds % 60

  if (hours > 0) {
    return `${hours}h ${minutes}m ${remainder}s`
  }

  if (minutes > 0) {
    return `${minutes}m ${remainder}s`
  }

  return `${remainder}s`
}

export default function SystemRoute() {
  const data = useLoaderData<typeof loader>()
  const initialSnapshot = data.snapshot
  const [snapshot, setSnapshot] = useState<SystemStatus>(initialSnapshot)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [restartState, setRestartState] = useState<
    "idle" | "confirming" | "submitting" | "restarting" | "error"
  >("idle")
  const [restartMessage, setRestartMessage] = useState<string | null>(
    data.status === "error" ? data.message : null
  )

  const isDegraded = snapshot.status === "degraded"

  const refreshSnapshot = async (): Promise<void> => {
    setIsRefreshing(true)
    try {
      const next = await fetchSystemStatus()
      setSnapshot(next)
    } finally {
      setIsRefreshing(false)
    }
  }

  const requestRestart = async (): Promise<void> => {
    setRestartState("submitting")
    setRestartMessage(null)

    try {
      const response = await requestRuntimeRestart()
      setRestartState("restarting")
      setRestartMessage(response.message)
    } catch {
      setRestartState("error")
      setRestartMessage("Failed to request runtime restart. Check control-plane logs.")
    }
  }

  useEffect(() => {
    if (restartState !== "restarting") {
      return
    }

    const timer = window.setInterval(async () => {
      try {
        const next = await fetchSystemStatus()
        setSnapshot(next)

        if (next.status === "ok") {
          setRestartState("idle")
          setRestartMessage("Runtime recovered and is healthy again.")
        } else {
          setRestartMessage("Runtime is restarting. Waiting for healthy status...")
        }
      } catch {
        setRestartMessage("Runtime is temporarily unavailable during restart. Retrying...")
      }
    }, 2000)

    return () => {
      window.clearInterval(timer)
    }
  }, [restartState])

  const sortedServices = useMemo(() => {
    return [...snapshot.services].sort((a, b) => a.label.localeCompare(b.label))
  }, [snapshot.services])

  return (
    <section className="mx-auto w-full max-w-5xl px-1 pb-6 md:px-2">
      <header className="mb-4 flex items-end justify-between gap-3 max-[720px]:flex-col max-[720px]:items-start">
        <div>
          <p className="mb-2 font-mono text-xs tracking-[0.2em] text-[#888888] uppercase">System</p>
          <h1 className="m-0 text-4xl font-light tracking-tight text-[#1a1a1a] max-[720px]:text-[2.35rem] max-[720px]:leading-[0.95]">
            Runtime Status and Operations
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={refreshSnapshot} disabled={isRefreshing}>
            {isRefreshing ? "Refreshing" : "Refresh"}
          </Button>
          <Link to="/" className="inline-flex">
            <Button variant="outline" size="sm">
              Home
            </Button>
          </Link>
        </div>
      </header>

      {restartState === "restarting" || isDegraded || restartMessage ? (
        <Card className="mb-4 border-[rgba(235,59,59,0.35)] bg-[rgba(255,247,247,0.9)]">
          <CardHeader>
            <CardTitle className="text-[#9f2424]">Degraded Window</CardTitle>
            <CardDescription>
              {restartState === "restarting"
                ? "Runtime restart in progress"
                : "Runtime attention needed"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="m-0 text-[0.95rem] text-[#581c1c]">
              {restartMessage ??
                "One or more runtime services are degraded. Review the matrix below."}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription>Runtime Metadata</CardDescription>
            <CardTitle className={resolveStatusToneClass(snapshot.status)}>
              {snapshot.status.toUpperCase()}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pb-2 text-[0.95rem] md:text-[0.92rem]">
            <p className="m-0">Version: {snapshot.runtime.version}</p>
            <p className="m-0">PID: {snapshot.runtime.pid}</p>
            <p className="m-0">Started: {formatDateTime(snapshot.runtime.startedAt)}</p>
            <p className="m-0">Uptime: {formatUptime(snapshot.runtime.uptimeSec)}</p>
          </CardContent>
          <CardFooter>
            <p className="m-0 text-[0.83rem] text-[#888888]">
              Last check: {formatDateTime(snapshot.checkedAt)}
            </p>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Runtime Operations</CardDescription>
            <CardTitle>Restart Runtime</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="m-0 text-[0.96rem] text-[#303030] md:text-[0.92rem]">
              Restart only the Otto runtime process. The control-plane web process stays available.
            </p>
          </CardContent>
          <CardFooter className="flex gap-2">
            {restartState === "confirming" ? (
              <>
                <Button size="sm" onClick={requestRestart}>
                  Confirm Restart
                </Button>
                <Button variant="outline" size="sm" onClick={() => setRestartState("idle")}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                onClick={() => setRestartState("confirming")}
                disabled={restartState === "submitting" || restartState === "restarting"}
              >
                {restartState === "restarting" ? "Restarting" : "Restart Runtime"}
              </Button>
            )}
          </CardFooter>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardDescription>Service Matrix</CardDescription>
          <CardTitle>Service Health</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pb-4">
          {sortedServices.map((service) => (
            <div key={service.id} className="flex items-start justify-between gap-4">
              <div>
                <p className="m-0 text-[0.95rem] font-medium text-[#1a1a1a]">{service.label}</p>
                <p className="m-0 text-[0.85rem] text-[#6c6c6c]">{service.message}</p>
              </div>
              <p
                className={`m-0 font-mono text-xs tracking-[0.1em] uppercase ${resolveStatusToneClass(service.status)}`}
              >
                {service.status}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  )
}
