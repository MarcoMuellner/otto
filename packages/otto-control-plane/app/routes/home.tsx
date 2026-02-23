import { useEffect, useState } from "react"
import { useLoaderData } from "react-router"
import { z } from "zod"

import { CommandBar } from "../components/command/command-bar.js"
import { RuntimeHealthCard } from "../components/health/runtime-health-card.js"
import { loadRuntimeHealthSnapshot, type RuntimeHealthSnapshot } from "../server/health.server.js"

type HomeLoaderData = {
  health: RuntimeHealthSnapshot
}

const runtimeHealthSnapshotSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  runtimeStatus: z.enum(["ok", "unavailable"]),
  message: z.string().min(1),
  checkedAt: z.string().min(1),
})

export const loader = async (): Promise<HomeLoaderData> => {
  return {
    health: await loadRuntimeHealthSnapshot(),
  }
}

const refreshHealth = async (): Promise<RuntimeHealthSnapshot> => {
  const response = await fetch("/api/health", { method: "GET" })
  const body = await response.json()
  return runtimeHealthSnapshotSchema.parse(body)
}

const formatClock = (date: Date): string => {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date)
}

export default function HomeRoute() {
  const loaderData = useLoaderData<typeof loader>()
  const [health, setHealth] = useState<RuntimeHealthSnapshot>(loaderData.health)
  const [refreshState, setRefreshState] = useState<"idle" | "loading" | "error">("idle")
  const [clock, setClock] = useState(() => formatClock(new Date()))

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClock(formatClock(new Date()))
    }, 1000)

    return () => {
      window.clearInterval(timer)
    }
  }, [])

  const handleRefresh = async (): Promise<void> => {
    setRefreshState("loading")
    try {
      const nextHealth = await refreshHealth()
      setHealth(nextHealth)
      setRefreshState("idle")
    } catch {
      setRefreshState("error")
    }
  }

  return (
    <section className="mx-auto flex min-h-[calc(100dvh-4.5rem)] w-full max-w-5xl flex-col items-center justify-start px-2 pb-4 pt-3 md:justify-center md:pb-6">
      <span
        className="mb-6 inline-flex h-2.5 w-2.5 rounded-full bg-[#eb3b3b] shadow-[0_0_15px_rgba(235,59,59,0.35)] md:mb-10 md:h-3 md:w-3"
        aria-hidden="true"
      />

      <h1 className="mb-1 select-none text-[clamp(3.5rem,22vw,5rem)] leading-none font-light tracking-tight text-[#1a1a1a] md:text-8xl">
        {clock}
      </h1>
      <p className="mb-5 select-none font-mono text-[11px] tracking-[0.2em] text-[#888888] uppercase md:mb-16 md:text-sm">
        {health.runtimeStatus === "ok" ? "System Active" : "System Degraded"}
      </p>

      <CommandBar placeholder="Ask Otto..." />

      <div className="mt-4 w-full max-w-xl md:mt-6">
        <RuntimeHealthCard health={health} refreshState={refreshState} onRefresh={handleRefresh} />
      </div>
    </section>
  )
}
