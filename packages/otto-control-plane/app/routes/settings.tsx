import { useEffect, useState, type FormEvent } from "react"
import { Link, useLoaderData } from "react-router"
import { toast } from "sonner"

import { Button } from "../components/ui/button.js"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card.js"
import { Switch } from "../components/ui/switch.js"
import type { NotificationProfile } from "../features/settings/contracts.js"
import {
  notificationProfileResponseSchema,
  updateNotificationProfileResponseSchema,
} from "../features/settings/contracts.js"
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

const timePattern = /^(?:[01]?\d|2[0-3]):[0-5]\d$/

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

  useEffect(() => {
    if (data.status !== "success") {
      return
    }

    setFormState(toFormState(data.profile))
  }, [data])

  if (data.status === "error") {
    return (
      <section className="mx-auto w-full max-w-5xl px-2 pb-8">
        <header className="mb-6 flex items-end justify-between gap-3 max-[720px]:flex-col max-[720px]:items-start">
          <div>
            <p className="mb-2 font-mono text-xs tracking-[0.2em] text-[#888888] uppercase">
              Settings
            </p>
            <h1 className="m-0 text-4xl font-light tracking-tight text-[#1a1a1a] max-[720px]:text-3xl">
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

  return (
    <section className="mx-auto w-full max-w-5xl px-2 pb-8">
      <header className="mb-6 flex items-end justify-between gap-3 max-[720px]:flex-col max-[720px]:items-start">
        <div>
          <p className="mb-2 font-mono text-xs tracking-[0.2em] text-[#888888] uppercase">
            Settings
          </p>
          <h1 className="m-0 text-4xl font-light tracking-tight text-[#1a1a1a] max-[720px]:text-3xl">
            Notification Profile
          </h1>
        </div>
        <div className="flex gap-2">
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
          <form className="grid gap-4" onSubmit={onSubmit}>
            <div className="grid gap-1">
              <label
                htmlFor="settings-timezone"
                className="text-xs font-mono text-[#666666] uppercase"
              >
                Timezone
              </label>
              <input
                id="settings-timezone"
                value={formState.timezone}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, timezone: event.target.value }))
                }
                className="rounded-lg border border-[rgba(26,26,26,0.14)] bg-white px-3 py-2 text-sm text-[#1a1a1a]"
                placeholder="Europe/Vienna"
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="grid gap-1">
                <label
                  htmlFor="settings-quiet-start"
                  className="text-xs font-mono text-[#666666] uppercase"
                >
                  Quiet Start
                </label>
                <input
                  id="settings-quiet-start"
                  value={formState.quietHoursStart}
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, quietHoursStart: event.target.value }))
                  }
                  className="rounded-lg border border-[rgba(26,26,26,0.14)] bg-white px-3 py-2 text-sm text-[#1a1a1a]"
                  placeholder="20:00"
                />
              </div>
              <div className="grid gap-1">
                <label
                  htmlFor="settings-quiet-end"
                  className="text-xs font-mono text-[#666666] uppercase"
                >
                  Quiet End
                </label>
                <input
                  id="settings-quiet-end"
                  value={formState.quietHoursEnd}
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, quietHoursEnd: event.target.value }))
                  }
                  className="rounded-lg border border-[rgba(26,26,26,0.14)] bg-white px-3 py-2 text-sm text-[#1a1a1a]"
                  placeholder="08:00"
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="grid gap-1">
                <label
                  htmlFor="settings-heartbeat-morning"
                  className="text-xs font-mono text-[#666666] uppercase"
                >
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
                  className="rounded-lg border border-[rgba(26,26,26,0.14)] bg-white px-3 py-2 text-sm text-[#1a1a1a]"
                  placeholder="08:30"
                />
              </div>
              <div className="grid gap-1">
                <label
                  htmlFor="settings-heartbeat-midday"
                  className="text-xs font-mono text-[#666666] uppercase"
                >
                  Midday
                </label>
                <input
                  id="settings-heartbeat-midday"
                  value={formState.heartbeatMidday}
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, heartbeatMidday: event.target.value }))
                  }
                  className="rounded-lg border border-[rgba(26,26,26,0.14)] bg-white px-3 py-2 text-sm text-[#1a1a1a]"
                  placeholder="12:30"
                />
              </div>
              <div className="grid gap-1">
                <label
                  htmlFor="settings-heartbeat-evening"
                  className="text-xs font-mono text-[#666666] uppercase"
                >
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
                  className="rounded-lg border border-[rgba(26,26,26,0.14)] bg-white px-3 py-2 text-sm text-[#1a1a1a]"
                  placeholder="19:00"
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="grid gap-1">
                <label
                  htmlFor="settings-cadence"
                  className="text-xs font-mono text-[#666666] uppercase"
                >
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
                  className="rounded-lg border border-[rgba(26,26,26,0.14)] bg-white px-3 py-2 text-sm text-[#1a1a1a]"
                />
              </div>
              <div className="grid gap-1">
                <label
                  htmlFor="settings-quiet-mode"
                  className="text-xs font-mono text-[#666666] uppercase"
                >
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
                  className="rounded-lg border border-[rgba(26,26,26,0.14)] bg-white px-3 py-2 text-sm text-[#1a1a1a]"
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
    </section>
  )
}
