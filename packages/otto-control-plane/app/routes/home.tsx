import { useState } from "react"
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

export default function HomeRoute() {
  const loaderData = useLoaderData<typeof loader>()
  const [health, setHealth] = useState<RuntimeHealthSnapshot>(loaderData.health)
  const [refreshState, setRefreshState] = useState<"idle" | "loading" | "error">("idle")

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
    <section className="rounded-[24px] border border-[rgba(26,26,26,0.08)] bg-[rgba(255,255,255,0.74)] p-[26px] backdrop-blur-[8px] max-[720px]:p-[18px]">
      <header className="mb-5">
        <p className="m-0 font-mono text-[11px] tracking-[0.12em] text-[#888888] uppercase">
          Otto Control Plane
        </p>
        <h1 className="mt-1.5 mb-2 text-[clamp(2rem,5vw,2.8rem)] leading-none font-light">
          Quiet Control
        </h1>
        <p className="m-0 text-[0.95rem] text-[#888888]">
          Separate web process, runtime-owned API, and server-only secrets by default.
        </p>
      </header>

      <CommandBar placeholder="Type a command (Ticket 002 scaffold)" />
      <RuntimeHealthCard health={health} refreshState={refreshState} onRefresh={handleRefresh} />
    </section>
  )
}
