import { useEffect, useState, type FormEvent } from "react"
import { Link, useLoaderData } from "react-router"
import { toast } from "sonner"

import { Button } from "../components/ui/button.js"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card.js"
import { Switch } from "../components/ui/switch.js"
import type { ModelCatalogResponse, ModelDefaultsResponse } from "../features/models/contracts.js"
import {
  modelCatalogResponseSchema,
  modelDefaultsResponseSchema,
  modelRefreshResponseSchema,
} from "../features/models/contracts.js"
import type { NotificationProfile } from "../features/settings/contracts.js"
import {
  notificationProfileResponseSchema,
  updateNotificationProfileResponseSchema,
} from "../features/settings/contracts.js"
import { formatDateTime } from "../lib/date-time.js"
import { createOttoExternalApiClientFromEnvironment } from "../server/otto-external-api.server.js"

type SettingsLoaderData =
  | {
      status: "success"
      profile: NotificationProfile
    }
  | {
      status: "error"
      message: string
    }

type SettingsFormState = {
  timezone: string
  quietHoursStart: string
  quietHoursEnd: string
  heartbeatMorning: string
  heartbeatMidday: string
  heartbeatEvening: string
  heartbeatCadenceMinutes: string
  quietMode: "critical_only" | "off"
  heartbeatOnlyIfSignal: boolean
}

type Feedback = {
  kind: "error"
  message: string
}

type ModelFeedback = {
  kind: "error" | "success"
  message: string
}

type ModelDefaultsFormState = {
  interactiveAssistant: string
  scheduledTasks: string
  heartbeat: string
  watchdogFailures: string
}

const INHERIT_OPTION_VALUE = "inherit"

const timePattern = /^(?:[01]?\d|2[0-3]):[0-5]\d$/

const settingsLabelClassName = "text-xs font-mono text-[#666666] uppercase"
const settingsFieldClassName =
  "w-full min-w-0 rounded-lg border border-[rgba(26,26,26,0.14)] bg-white px-3.5 py-2.5 text-base leading-6 text-[#1a1a1a]"

const isValidIanaTimezone = (value: string): boolean => {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: value })
    return true
  } catch {
    return false
  }
}

const defaultSettingsFormState: SettingsFormState = {
  timezone: "Europe/Vienna",
  quietHoursStart: "20:00",
  quietHoursEnd: "08:00",
  heartbeatMorning: "08:30",
  heartbeatMidday: "12:30",
  heartbeatEvening: "19:00",
  heartbeatCadenceMinutes: "180",
  quietMode: "critical_only",
  heartbeatOnlyIfSignal: true,
}

const toFormState = (profile: NotificationProfile): SettingsFormState => {
  return {
    timezone: profile.timezone ?? "",
    quietHoursStart: profile.quietHoursStart ?? "",
    quietHoursEnd: profile.quietHoursEnd ?? "",
    heartbeatMorning: profile.heartbeatMorning ?? "",
    heartbeatMidday: profile.heartbeatMidday ?? "",
    heartbeatEvening: profile.heartbeatEvening ?? "",
    heartbeatCadenceMinutes:
      profile.heartbeatCadenceMinutes == null ? "" : String(profile.heartbeatCadenceMinutes),
    quietMode: profile.quietMode === "off" ? "off" : "critical_only",
    heartbeatOnlyIfSignal: profile.heartbeatOnlyIfSignal,
  }
}

const toModelDefaultsFormState = (defaults: ModelDefaultsResponse): ModelDefaultsFormState => {
  return {
    interactiveAssistant: defaults.flowDefaults.interactiveAssistant ?? INHERIT_OPTION_VALUE,
    scheduledTasks: defaults.flowDefaults.scheduledTasks ?? INHERIT_OPTION_VALUE,
    heartbeat: defaults.flowDefaults.heartbeat ?? INHERIT_OPTION_VALUE,
    watchdogFailures: defaults.flowDefaults.watchdogFailures ?? INHERIT_OPTION_VALUE,
  }
}

const toModelDefaultsPayload = (formState: ModelDefaultsFormState): ModelDefaultsResponse => {
  return {
    flowDefaults: {
      interactiveAssistant:
        formState.interactiveAssistant === INHERIT_OPTION_VALUE
          ? null
          : formState.interactiveAssistant,
      scheduledTasks:
        formState.scheduledTasks === INHERIT_OPTION_VALUE ? null : formState.scheduledTasks,
      heartbeat: formState.heartbeat === INHERIT_OPTION_VALUE ? null : formState.heartbeat,
      watchdogFailures:
        formState.watchdogFailures === INHERIT_OPTION_VALUE ? null : formState.watchdogFailures,
    },
  }
}

const readProfile = async (): Promise<NotificationProfile> => {
  const response = await fetch("/api/settings/notification-profile", {
    method: "GET",
  })
  const body = await response.json()

  if (!response.ok) {
    const message = typeof body?.message === "string" ? body.message : "Could not load settings"
    throw new Error(message)
  }

  return notificationProfileResponseSchema.parse(body).profile
}

const readModelCatalog = async (): Promise<ModelCatalogResponse> => {
  const response = await fetch("/api/models/catalog", {
    method: "GET",
  })
  const body = await response.json()

  if (!response.ok) {
    const message =
      typeof body?.message === "string" ? body.message : "Could not load model catalog"
    throw new Error(message)
  }

  return modelCatalogResponseSchema.parse(body)
}

const readModelDefaults = async (): Promise<ModelDefaultsResponse> => {
  const response = await fetch("/api/models/defaults", {
    method: "GET",
  })
  const body = await response.json()

  if (!response.ok) {
    const message = typeof body?.message === "string" ? body.message : "Could not load defaults"
    throw new Error(message)
  }

  return modelDefaultsResponseSchema.parse(body)
}

export const loader = async (): Promise<SettingsLoaderData> => {
  try {
    const client = await createOttoExternalApiClientFromEnvironment()
    const response = await client.getNotificationProfile()

    return {
      status: "success",
      profile: response.profile,
    }
  } catch {
    return {
      status: "error",
      message: "Could not load settings right now. Check runtime availability.",
    }
  }
}

export default function SettingsRoute() {
  const data = useLoaderData<typeof loader>()
  const [formState, setFormState] = useState<SettingsFormState>(
    data.status === "success" ? toFormState(data.profile) : defaultSettingsFormState
  )
  const [isSaving, setIsSaving] = useState(false)
  const [feedback, setFeedback] = useState<Feedback | null>(
    data.status === "error"
      ? {
          kind: "error",
          message: data.message,
        }
      : null
  )
  const [catalog, setCatalog] = useState<ModelCatalogResponse | null>(null)
  const [defaultsFormState, setDefaultsFormState] = useState<ModelDefaultsFormState | null>(null)
  const [modelFeedback, setModelFeedback] = useState<ModelFeedback | null>(null)
  const [isLoadingModels, setIsLoadingModels] = useState(true)
  const [isRefreshingCatalog, setIsRefreshingCatalog] = useState(false)
  const [isSavingDefaults, setIsSavingDefaults] = useState(false)

  useEffect(() => {
    if (data.status !== "success") {
      return
    }

    setFormState(toFormState(data.profile))
  }, [data])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setIsLoadingModels(true)
      const [catalogResult, defaultsResult] = await Promise.allSettled([
        readModelCatalog(),
        readModelDefaults(),
      ])

      if (cancelled) {
        return
      }

      if (catalogResult.status === "fulfilled") {
        setCatalog(catalogResult.value)
      }

      if (defaultsResult.status === "fulfilled") {
        setDefaultsFormState(toModelDefaultsFormState(defaultsResult.value))
      }

      if (catalogResult.status === "fulfilled" && defaultsResult.status === "fulfilled") {
        setModelFeedback(null)
      } else {
        const errors = [catalogResult, defaultsResult]
          .filter((result): result is PromiseRejectedResult => result.status === "rejected")
          .map((result) => {
            return result.reason instanceof Error
              ? result.reason.message
              : "Could not load model management"
          })

        setModelFeedback({ kind: "error", message: errors.join(" ") })
      }

      if (!cancelled) {
        setIsLoadingModels(false)
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [])

  if (data.status === "error") {
    return (
      <section className="mx-auto w-full max-w-5xl px-1 pb-6 md:px-2">
        <header className="mb-4 flex items-end justify-between gap-3 max-[720px]:flex-col max-[720px]:items-start">
          <div>
            <p className="mb-2 font-mono text-xs tracking-[0.2em] text-[#888888] uppercase">
              Settings
            </p>
            <h1 className="m-0 text-4xl font-light tracking-tight text-[#1a1a1a] max-[720px]:text-[2.35rem] max-[720px]:leading-[0.95]">
              Notification Profile
            </h1>
          </div>
          <Link to="/" className="inline-flex">
            <Button variant="outline" size="sm">
              Home
            </Button>
          </Link>
        </header>
        <Card>
          <CardHeader>
            <CardTitle>Settings unavailable</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="m-0 text-sm text-[#888888]">{feedback?.message ?? data.message}</p>
          </CardContent>
        </Card>
      </section>
    )
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isSaving) {
      return
    }

    if (formState.timezone.trim().length === 0) {
      setFeedback({ kind: "error", message: "Timezone is required." })
      return
    }

    if (!isValidIanaTimezone(formState.timezone.trim())) {
      setFeedback({ kind: "error", message: "Timezone must be a valid IANA timezone." })
      return
    }

    const timeFields: Array<{ label: string; value: string }> = [
      { label: "Quiet start", value: formState.quietHoursStart },
      { label: "Quiet end", value: formState.quietHoursEnd },
      { label: "Heartbeat morning", value: formState.heartbeatMorning },
      { label: "Heartbeat midday", value: formState.heartbeatMidday },
      { label: "Heartbeat evening", value: formState.heartbeatEvening },
    ]

    for (const field of timeFields) {
      const trimmed = field.value.trim()
      if (trimmed.length > 0 && !timePattern.test(trimmed)) {
        setFeedback({ kind: "error", message: `${field.label} must use HH:MM format.` })
        return
      }
    }

    const cadenceRaw = formState.heartbeatCadenceMinutes.trim()
    let cadence: number | null = null
    if (cadenceRaw.length > 0) {
      const parsedCadence = Number(cadenceRaw)
      if (!Number.isInteger(parsedCadence) || parsedCadence < 30 || parsedCadence > 24 * 60) {
        setFeedback({
          kind: "error",
          message: "Heartbeat cadence must be a whole number between 30 and 1440.",
        })
        return
      }

      cadence = parsedCadence
    }

    const payload = {
      timezone: formState.timezone.trim(),
      quietHoursStart: formState.quietHoursStart.trim() || null,
      quietHoursEnd: formState.quietHoursEnd.trim() || null,
      heartbeatMorning: formState.heartbeatMorning.trim() || null,
      heartbeatMidday: formState.heartbeatMidday.trim() || null,
      heartbeatEvening: formState.heartbeatEvening.trim() || null,
      heartbeatCadenceMinutes: cadence,
      quietMode: formState.quietMode,
      heartbeatOnlyIfSignal: formState.heartbeatOnlyIfSignal,
    }

    setIsSaving(true)
    setFeedback(null)
    try {
      const response = await fetch("/api/settings/notification-profile", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      })
      const body = await response.json()

      if (!response.ok) {
        const zodMessage =
          Array.isArray(body?.details) && typeof body.details[0]?.message === "string"
            ? body.details[0].message
            : null
        const message =
          typeof body?.message === "string"
            ? body.message
            : (zodMessage ?? "Could not save settings")
        setFeedback({ kind: "error", message })
        return
      }

      const parsed = updateNotificationProfileResponseSchema.parse(body)
      setFormState(toFormState(parsed.profile))
      setFeedback(null)
      toast.success("Settings saved")
    } catch {
      setFeedback({ kind: "error", message: "Could not reach the control plane API." })
    } finally {
      setIsSaving(false)
    }
  }

  const onRefresh = async () => {
    try {
      const profile = await readProfile()
      setFormState(toFormState(profile))
      setFeedback(null)
      toast.success("Settings refreshed")
    } catch (error) {
      setFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Could not refresh settings",
      })
    }
  }

  const onRefreshCatalog = async () => {
    if (isRefreshingCatalog) {
      return
    }

    setIsRefreshingCatalog(true)
    try {
      const refreshResponse = await fetch("/api/models/refresh", {
        method: "POST",
      })
      const refreshBody = await refreshResponse.json()
      if (!refreshResponse.ok) {
        const message =
          typeof refreshBody?.message === "string"
            ? refreshBody.message
            : "Could not refresh model catalog"
        throw new Error(message)
      }

      modelRefreshResponseSchema.parse(refreshBody)

      const [nextCatalog, nextDefaults] = await Promise.all([
        readModelCatalog(),
        readModelDefaults(),
      ])
      setCatalog(nextCatalog)
      setDefaultsFormState(toModelDefaultsFormState(nextDefaults))
      setModelFeedback({ kind: "success", message: "Model catalog refreshed." })
      toast.success("Model catalog refreshed")
    } catch (error) {
      setModelFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Could not refresh model catalog",
      })
    } finally {
      setIsRefreshingCatalog(false)
    }
  }

  const onSaveModelDefaults = async () => {
    if (!defaultsFormState || isSavingDefaults) {
      return
    }

    setIsSavingDefaults(true)
    try {
      const response = await fetch("/api/models/defaults", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(toModelDefaultsPayload(defaultsFormState)),
      })
      const body = await response.json()

      if (!response.ok) {
        const zodMessage =
          Array.isArray(body?.details) && typeof body.details[0]?.message === "string"
            ? body.details[0].message
            : null
        const message =
          typeof body?.message === "string"
            ? body.message
            : (zodMessage ?? "Could not save defaults")
        throw new Error(message)
      }

      const parsed = modelDefaultsResponseSchema.parse(body)
      setDefaultsFormState(toModelDefaultsFormState(parsed))
      setModelFeedback({ kind: "success", message: "Flow defaults saved." })
      toast.success("Model defaults saved")
    } catch (error) {
      setModelFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Could not save defaults",
      })
    } finally {
      setIsSavingDefaults(false)
    }
  }

  const availableModels = catalog?.models ?? []
  const defaultsState = defaultsFormState ?? {
    interactiveAssistant: INHERIT_OPTION_VALUE,
    scheduledTasks: INHERIT_OPTION_VALUE,
    heartbeat: INHERIT_OPTION_VALUE,
    watchdogFailures: INHERIT_OPTION_VALUE,
  }
  const lastUpdatedLabel = catalog?.updatedAt == null ? "Never" : formatDateTime(catalog.updatedAt)

  return (
    <section className="mx-auto w-full max-w-5xl px-1 pb-6 md:px-2">
      <header className="mb-4 flex items-end justify-between gap-3 max-[720px]:flex-col max-[720px]:items-start">
        <div>
          <p className="mb-2 font-mono text-xs tracking-[0.2em] text-[#888888] uppercase">
            Settings
          </p>
          <h1 className="m-0 text-4xl font-light tracking-tight text-[#1a1a1a] max-[720px]:text-[2.35rem] max-[720px]:leading-[0.95]">
            Notification Profile
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => void onRefresh()}>
            Refresh
          </Button>
          <Link to="/" className="inline-flex">
            <Button variant="outline" size="sm">
              Home
            </Button>
          </Link>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardDescription>Editable non-secret notification settings</CardDescription>
          <CardTitle>Delivery Preferences</CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          <form className="grid gap-3" onSubmit={onSubmit}>
            <div className="grid gap-1">
              <label htmlFor="settings-timezone" className={settingsLabelClassName}>
                Timezone
              </label>
              <input
                id="settings-timezone"
                value={formState.timezone}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, timezone: event.target.value }))
                }
                className={settingsFieldClassName}
                placeholder="Europe/Vienna"
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="grid gap-1">
                <label htmlFor="settings-quiet-start" className={settingsLabelClassName}>
                  Quiet Start
                </label>
                <input
                  id="settings-quiet-start"
                  value={formState.quietHoursStart}
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, quietHoursStart: event.target.value }))
                  }
                  className={settingsFieldClassName}
                  placeholder="20:00"
                />
              </div>
              <div className="grid gap-1">
                <label htmlFor="settings-quiet-end" className={settingsLabelClassName}>
                  Quiet End
                </label>
                <input
                  id="settings-quiet-end"
                  value={formState.quietHoursEnd}
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, quietHoursEnd: event.target.value }))
                  }
                  className={settingsFieldClassName}
                  placeholder="08:00"
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="grid gap-1">
                <label htmlFor="settings-heartbeat-morning" className={settingsLabelClassName}>
                  Morning
                </label>
                <input
                  id="settings-heartbeat-morning"
                  value={formState.heartbeatMorning}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      heartbeatMorning: event.target.value,
                    }))
                  }
                  className={settingsFieldClassName}
                  placeholder="08:30"
                />
              </div>
              <div className="grid gap-1">
                <label htmlFor="settings-heartbeat-midday" className={settingsLabelClassName}>
                  Midday
                </label>
                <input
                  id="settings-heartbeat-midday"
                  value={formState.heartbeatMidday}
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, heartbeatMidday: event.target.value }))
                  }
                  className={settingsFieldClassName}
                  placeholder="12:30"
                />
              </div>
              <div className="grid gap-1">
                <label htmlFor="settings-heartbeat-evening" className={settingsLabelClassName}>
                  Evening
                </label>
                <input
                  id="settings-heartbeat-evening"
                  value={formState.heartbeatEvening}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      heartbeatEvening: event.target.value,
                    }))
                  }
                  className={settingsFieldClassName}
                  placeholder="19:00"
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="grid gap-1">
                <label htmlFor="settings-cadence" className={settingsLabelClassName}>
                  Heartbeat Cadence (minutes)
                </label>
                <input
                  id="settings-cadence"
                  type="number"
                  min={30}
                  max={24 * 60}
                  value={formState.heartbeatCadenceMinutes}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      heartbeatCadenceMinutes: event.target.value,
                    }))
                  }
                  className={settingsFieldClassName}
                />
              </div>
              <div className="grid gap-1">
                <label htmlFor="settings-quiet-mode" className={settingsLabelClassName}>
                  Quiet Mode
                </label>
                <select
                  id="settings-quiet-mode"
                  value={formState.quietMode}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      quietMode: event.target.value as "critical_only" | "off",
                    }))
                  }
                  className={settingsFieldClassName}
                >
                  <option value="critical_only">Critical only</option>
                  <option value="off">Off</option>
                </select>
              </div>
            </div>

            <Switch
              checked={formState.heartbeatOnlyIfSignal}
              onCheckedChange={(checked) =>
                setFormState((current) => ({ ...current, heartbeatOnlyIfSignal: checked }))
              }
              label="Only send heartbeat with signal"
            />

            {feedback ? <p className="m-0 text-sm text-[#b42318]">{feedback.message}</p> : null}

            <div className="flex justify-end pt-1">
              <Button type="submit" disabled={isSaving}>
                {isSaving ? "Saving..." : "Save Settings"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="mt-3">
        <CardHeader>
          <CardDescription>Runtime model catalog and flow defaults</CardDescription>
          <CardTitle>Model Management</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pb-4">
          <div className="grid gap-3 rounded-lg border border-[rgba(26,26,26,0.1)] bg-[rgba(248,248,248,0.8)] p-3 md:grid-cols-3">
            <p className="m-0 text-sm text-[#444444]">Catalog size: {availableModels.length}</p>
            <p className="m-0 text-sm text-[#444444]">
              Source: {catalog?.source ?? (isLoadingModels ? "Loading" : "Unknown")}
            </p>
            <p className="m-0 text-sm text-[#444444]">Updated: {lastUpdatedLabel}</p>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void onRefreshCatalog()}
              disabled={isRefreshingCatalog || isLoadingModels}
            >
              {isRefreshingCatalog ? "Refreshing..." : "Refresh Catalog"}
            </Button>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="grid gap-1">
              <label htmlFor="model-default-interactive" className={settingsLabelClassName}>
                interactiveAssistant
              </label>
              <select
                id="model-default-interactive"
                value={defaultsState.interactiveAssistant}
                onChange={(event) =>
                  setDefaultsFormState((current) => ({
                    ...(current ?? defaultsState),
                    interactiveAssistant: event.target.value,
                  }))
                }
                className={settingsFieldClassName}
                disabled={isLoadingModels}
              >
                <option value={INHERIT_OPTION_VALUE}>inherit OpenCode default</option>
                {availableModels.map((model) => (
                  <option key={`interactive-${model}`} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-1">
              <label htmlFor="model-default-scheduled" className={settingsLabelClassName}>
                scheduledTasks
              </label>
              <select
                id="model-default-scheduled"
                value={defaultsState.scheduledTasks}
                onChange={(event) =>
                  setDefaultsFormState((current) => ({
                    ...(current ?? defaultsState),
                    scheduledTasks: event.target.value,
                  }))
                }
                className={settingsFieldClassName}
                disabled={isLoadingModels}
              >
                <option value={INHERIT_OPTION_VALUE}>inherit OpenCode default</option>
                {availableModels.map((model) => (
                  <option key={`scheduled-${model}`} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-1">
              <label htmlFor="model-default-heartbeat" className={settingsLabelClassName}>
                heartbeat
              </label>
              <select
                id="model-default-heartbeat"
                value={defaultsState.heartbeat}
                onChange={(event) =>
                  setDefaultsFormState((current) => ({
                    ...(current ?? defaultsState),
                    heartbeat: event.target.value,
                  }))
                }
                className={settingsFieldClassName}
                disabled={isLoadingModels}
              >
                <option value={INHERIT_OPTION_VALUE}>inherit OpenCode default</option>
                {availableModels.map((model) => (
                  <option key={`heartbeat-${model}`} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-1">
              <label htmlFor="model-default-watchdog" className={settingsLabelClassName}>
                watchdogFailures
              </label>
              <select
                id="model-default-watchdog"
                value={defaultsState.watchdogFailures}
                onChange={(event) =>
                  setDefaultsFormState((current) => ({
                    ...(current ?? defaultsState),
                    watchdogFailures: event.target.value,
                  }))
                }
                className={settingsFieldClassName}
                disabled={isLoadingModels}
              >
                <option value={INHERIT_OPTION_VALUE}>inherit OpenCode default</option>
                {availableModels.map((model) => (
                  <option key={`watchdog-${model}`} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {modelFeedback ? (
            <p
              className={
                modelFeedback.kind === "success"
                  ? "m-0 text-sm text-[#0f7b3a]"
                  : "m-0 text-sm text-[#b42318]"
              }
            >
              {modelFeedback.message}
            </p>
          ) : null}

          <div className="flex justify-end">
            <Button
              type="button"
              onClick={() => void onSaveModelDefaults()}
              disabled={isLoadingModels || isSavingDefaults || defaultsFormState === null}
            >
              {isSavingDefaults ? "Saving..." : "Save Model Defaults"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  )
}
