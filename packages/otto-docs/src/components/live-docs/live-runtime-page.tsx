import Link from "@docusaurus/Link"
import useDocusaurusContext from "@docusaurus/useDocusaurusContext"
import useBaseUrl from "@docusaurus/useBaseUrl"
import Layout from "@theme/Layout"
import type { FormEvent } from "react"
import { useEffect, useState } from "react"

type LiveSourceStatus = {
  source: string
  status: "ok" | "degraded"
  message: string
}

type RuntimeStatus = {
  version: string
  pid: number
  startedAt: number
  uptimeSec: number
}

type ProcessStatus = {
  id: string
  label: string
  status: "ok" | "degraded" | "disabled"
  message: string
}

type SchedulerLimits = {
  enabled: boolean
  tickMs: number
  batchSize: number
  lockLeaseMs: number
}

type PaginationLimits = {
  auditMax: number
  runsMax: number
  defaultListLimit: number
}

type ProfileLimits = {
  interactiveContextWindowSize: {
    min: number
    max: number
    current: number
  }
  contextRetentionCap: {
    min: number
    max: number
    current: number
  }
}

type DecisionRecord = {
  id: string
  source: "task_audit" | "command_audit"
  summary: string
  createdAt: number
}

type RiskRecord = {
  id: string
  code: string
  severity: "low" | "medium" | "high"
  message: string
  detectedAt: number
  source: "system" | "command_audit"
}

type LiveSnapshot = {
  state: {
    status: "ok" | "degraded"
    checkedAt: number
    runtime: RuntimeStatus
  }
  processes: ProcessStatus[]
  limits: {
    scheduler: SchedulerLimits
    pagination: PaginationLimits
    profile: ProfileLimits
  }
  recentDecisions: DecisionRecord[]
  openRisks: RiskRecord[]
  generatedAt: number
  sources: LiveSourceStatus[]
}

type RequestState = "idle" | "loading" | "ready" | "unauthorized" | "failed"

const TOKEN_STORAGE_KEY = "otto.docs.live.token"

const formatDateTime = (value: number): string => {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(value)
}

const formatUptime = (uptimeSec: number): string => {
  const hours = Math.floor(uptimeSec / 3600)
  const minutes = Math.floor((uptimeSec % 3600) / 60)
  const seconds = Math.floor(uptimeSec % 60)
  return `${hours}h ${minutes}m ${seconds}s`
}

const statusClass = (status: "ok" | "degraded" | "disabled"): string => {
  if (status === "ok") {
    return "is-ok"
  }

  if (status === "disabled") {
    return "is-disabled"
  }

  return "is-degraded"
}

const readTokenFromSessionStorage = (): string => {
  if (typeof window === "undefined") {
    return ""
  }

  return window.sessionStorage.getItem(TOKEN_STORAGE_KEY) ?? ""
}

const writeTokenToSessionStorage = (token: string): void => {
  if (typeof window === "undefined") {
    return
  }

  if (token.length === 0) {
    window.sessionStorage.removeItem(TOKEN_STORAGE_KEY)
    return
  }

  window.sessionStorage.setItem(TOKEN_STORAGE_KEY, token)
}

export default function LiveRuntimePage(): JSX.Element {
  const { siteConfig } = useDocusaurusContext()
  const docsTag = String(siteConfig.customFields?.docsTag ?? "vlocal-dev")
  const liveProxyPath = String(
    siteConfig.customFields?.liveProxyPath ?? "/api/live/self-awareness",
  )
  const liveEndpoint = useBaseUrl(liveProxyPath)

  const [tokenInput, setTokenInput] = useState("")
  const [requestState, setRequestState] = useState<RequestState>("idle")
  const [errorMessage, setErrorMessage] = useState("")
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null)

  const fetchSnapshot = async (token: string): Promise<void> => {
    if (token.length === 0) {
      setRequestState("unauthorized")
      setSnapshot(null)
      setErrorMessage("Enter an external API token to load live runtime data.")
      return
    }

    setRequestState("loading")
    setErrorMessage("")

    try {
      const response = await fetch(liveEndpoint, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (response.status === 401) {
        setRequestState("unauthorized")
        setSnapshot(null)
        setErrorMessage("Token rejected. Check OTTO_EXTERNAL_API_TOKEN and try again.")
        return
      }

      if (!response.ok) {
        setRequestState("failed")
        setSnapshot(null)
        setErrorMessage(`Live request failed (${response.status}).`)
        return
      }

      const payload = (await response.json()) as LiveSnapshot
      setSnapshot(payload)
      setRequestState("ready")
    } catch {
      setRequestState("failed")
      setSnapshot(null)
      setErrorMessage("Live endpoint unreachable. Confirm deployed docs service and API are running.")
    }
  }

  useEffect(() => {
    const storedToken = readTokenFromSessionStorage()
    if (storedToken.length === 0) {
      return
    }

    setTokenInput(storedToken)
    void fetchSnapshot(storedToken)
  }, [])

  const handleConnect = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    const token = tokenInput.trim()
    writeTokenToSessionStorage(token)
    await fetchSnapshot(token)
  }

  const handleClearToken = (): void => {
    writeTokenToSessionStorage("")
    setTokenInput("")
    setSnapshot(null)
    setRequestState("idle")
    setErrorMessage("")
  }

  return (
    <Layout
      title="Live Runtime View"
      description="Token-authenticated live runtime self-awareness data for deployed Otto docs"
    >
      <main className="container margin-vert--lg live-runtime-page">
        <header className="live-runtime-hero">
          <p className="live-runtime-kicker">Deployed docs surface</p>
          <h1>Live runtime self-awareness</h1>
          <p>
            This page fetches runtime state from the deployed docs service proxy. Public GitHub Pages
            docs never include this live route.
          </p>
          <p className="live-runtime-chip">Release docs version: {docsTag}</p>
          <p className="live-runtime-chip is-live">Live runtime view (token required)</p>
        </header>

        <section className="live-auth-card" aria-label="Token authentication form">
          <h2>Authenticate with external API token</h2>
          <p>
            Token is stored in session storage only and clears when this browser tab closes.
          </p>
          <form onSubmit={(event) => void handleConnect(event)} className="live-auth-form">
            <label htmlFor="otto-live-token">Bearer token</label>
            <input
              id="otto-live-token"
              type="password"
              value={tokenInput}
              onChange={(event) => setTokenInput(event.currentTarget.value)}
              placeholder="Paste OTTO_EXTERNAL_API_TOKEN"
              autoComplete="off"
              spellCheck={false}
            />
            <div className="live-auth-actions">
              <button className="button button--primary" type="submit" disabled={requestState === "loading"}>
                {requestState === "loading" ? "Loading..." : "Load Live Snapshot"}
              </button>
              <button className="button button--secondary" type="button" onClick={handleClearToken}>
                Clear Token
              </button>
            </div>
          </form>
          {errorMessage.length > 0 ? <p className="live-request-message is-error">{errorMessage}</p> : null}
        </section>

        {snapshot ? (
          <>
            <section className="live-card-grid" aria-label="Runtime summary cards">
              <article className="live-card">
                <h3>Runtime state</h3>
                <p className={`status-pill ${statusClass(snapshot.state.status)}`}>
                  {snapshot.state.status}
                </p>
                <ul>
                  <li>Version: {snapshot.state.runtime.version}</li>
                  <li>PID: {snapshot.state.runtime.pid}</li>
                  <li>Started: {formatDateTime(snapshot.state.runtime.startedAt)}</li>
                  <li>Uptime: {formatUptime(snapshot.state.runtime.uptimeSec)}</li>
                </ul>
              </article>

              <article className="live-card">
                <h3>Operational limits</h3>
                <ul>
                  <li>Scheduler enabled: {snapshot.limits.scheduler.enabled ? "yes" : "no"}</li>
                  <li>Scheduler tick: {snapshot.limits.scheduler.tickMs} ms</li>
                  <li>Scheduler batch size: {snapshot.limits.scheduler.batchSize}</li>
                  <li>Audit page max: {snapshot.limits.pagination.auditMax}</li>
                  <li>Runs page max: {snapshot.limits.pagination.runsMax}</li>
                </ul>
              </article>

              <article className="live-card">
                <h3>Data source health</h3>
                <ul>
                  {snapshot.sources.map((source) => (
                    <li key={source.source}>
                      <span className={`status-pill ${statusClass(source.status)}`}>{source.status}</span>{" "}
                      {source.source}: {source.message}
                    </li>
                  ))}
                </ul>
              </article>
            </section>

            <section className="live-section">
              <h2>Active processes</h2>
              <ul className="live-list">
                {snapshot.processes.map((process) => (
                  <li key={process.id}>
                    <strong>{process.label}</strong>
                    <span className={`status-pill ${statusClass(process.status)}`}>{process.status}</span>
                    <p>{process.message}</p>
                  </li>
                ))}
              </ul>
            </section>

            <section className="live-section">
              <h2>Recent decisions</h2>
              <ul className="live-list">
                {snapshot.recentDecisions.length === 0 ? <li>No recent decisions recorded.</li> : null}
                {snapshot.recentDecisions.map((decision) => (
                  <li key={decision.id}>
                    <p>
                      <strong>{decision.summary}</strong>
                    </p>
                    <p>
                      Source: {decision.source} | Created: {formatDateTime(decision.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            </section>

            <section className="live-section">
              <h2>Open risks</h2>
              <ul className="live-list">
                {snapshot.openRisks.length === 0 ? <li>No open risks detected.</li> : null}
                {snapshot.openRisks.map((risk) => (
                  <li key={risk.id}>
                    <p>
                      <strong>{risk.code}</strong> ({risk.severity})
                    </p>
                    <p>{risk.message}</p>
                    <p>
                      Source: {risk.source} | Detected: {formatDateTime(risk.detectedAt)}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          </>
        ) : null}

        <section className="live-links" aria-label="Operator actions and references">
          <h2>Operator actions and references</h2>
          <ul>
            <li>
              <Link to="/docs/operator-guide/overview">Operator guide runbooks</Link>
            </li>
            <li>
              <Link to="/docs/api-reference/overview">External API contract reference</Link>
            </li>
            <li>
              <code>ottoctl env set OTTO_EXTERNAL_API_TOKEN &lt;token&gt;</code>
            </li>
            <li>
              <code>ottoctl restart</code>
            </li>
          </ul>
        </section>
      </main>
    </Layout>
  )
}
