import { useEffect, useState } from "react"
import { useLoaderData } from "react-router"
import { z } from "zod"

import { CommandBar } from "../components/command/command-bar.js"
import { openCommandPalette } from "../components/command/events.js"
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
    <section className="mx-auto flex min-h-[calc(100dvh-4.5rem)] w-full max-w-5xl flex-col items-center justify-center px-2 pb-6">
      <button
        type="button"
        onClick={openCommandPalette}
        className="group relative mb-10 inline-flex h-3 w-3 items-center justify-center rounded-full bg-[#eb3b3b] shadow-[0_0_15px_rgba(235,59,59,0.35)] transition-colors hover:bg-[#1a1a1a]"
        aria-label="Open command palette"
      >
        <span className="pointer-events-none absolute -top-8 left-1/2 hidden -translate-x-1/2 whitespace-nowrap font-mono text-[10px] tracking-[0.12em] text-[#888888] uppercase opacity-0 transition-opacity group-hover:block group-hover:opacity-100">
          Open Command Palette
        </span>
      </button>

      <h1 className="mb-2 select-none text-6xl leading-none font-light tracking-tight text-[#1a1a1a] md:text-8xl">
        {clock}
      </h1>
      <p className="mb-10 select-none font-mono text-xs tracking-[0.2em] text-[#888888] uppercase md:mb-16 md:text-sm">
        {health.runtimeStatus === "ok" ? "System Active" : "System Degraded"}
      </p>

      <CommandBar placeholder="Ask Otto..." />

      <div className="mt-6 w-full max-w-xl">
        <RuntimeHealthCard health={health} refreshState={refreshState} onRefresh={handleRefresh} />
      </div>
    </section>
  )
}
