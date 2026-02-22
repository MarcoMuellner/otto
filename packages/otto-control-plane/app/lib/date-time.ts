const DATE_TIME_LOCALE = "de-AT"
const DATE_TIME_ZONE = "Europe/Vienna"
const DAY_IN_MS = 24 * 60 * 60 * 1000

const dateTimeFormatter = new Intl.DateTimeFormat(DATE_TIME_LOCALE, {
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZone: DATE_TIME_ZONE,
})

const timeFormatter = new Intl.DateTimeFormat(DATE_TIME_LOCALE, {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZone: DATE_TIME_ZONE,
})

/**
 * Formats epoch timestamps using a fixed locale and timezone so SSR and client hydration render
 * identical text.
 *
 * @param timestamp Epoch milliseconds or null.
 * @returns Human-readable date-time string for control-plane surfaces.
 */
export const formatDateTime = (timestamp: number | string | null): string => {
  if (timestamp === null) {
    return "-"
  }

  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) {
    return "-"
  }

  return dateTimeFormatter.format(date)
}

/**
 * Formats epoch timestamps as time-only strings with deterministic locale/timezone output.
 *
 * @param timestamp Epoch milliseconds.
 * @returns Time string in HH:mm:ss style.
 */
export const formatTime = (timestamp: number | string): string => {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) {
    return "--:--:--"
  }

  return timeFormatter.format(date)
}

/**
 * Formats how far a timestamp is from a fixed reference time, which keeps SSR/client rendering
 * deterministic while still showing human-readable countdown text.
 *
 * @param timestamp Target epoch value.
 * @param referenceNow Epoch milliseconds used as "now" baseline.
 * @returns Relative countdown text.
 */
export const formatTimeUntil = (
  timestamp: number | string | null,
  referenceNow: number
): string => {
  if (timestamp === null) {
    return "-"
  }

  const targetDate = new Date(timestamp)
  if (Number.isNaN(targetDate.getTime())) {
    return "-"
  }

  const deltaMs = targetDate.getTime() - referenceNow
  const absMinutes = Math.ceil(Math.abs(deltaMs) / 60_000)
  if (absMinutes === 0) {
    return "due now"
  }

  const hours = Math.floor(absMinutes / 60)
  const minutes = absMinutes % 60
  const parts: string[] = []
  if (hours > 0) {
    parts.push(`${hours} h`)
  }
  if (minutes > 0 || hours === 0) {
    parts.push(`${minutes} min`)
  }

  return deltaMs >= 0 ? `${parts.join(" ")} to go` : `${parts.join(" ")} overdue`
}

/**
 * Formats next-run timestamps as relative text for near-term events and absolute date-time for
 * events farther than 24 hours away.
 *
 * @param timestamp Target epoch value.
 * @param referenceNow Epoch milliseconds used as "now" baseline.
 * @returns Next-run label for jobs surfaces.
 */
export const formatNextRun = (timestamp: number | string | null, referenceNow: number): string => {
  if (timestamp === null) {
    return "-"
  }

  const targetDate = new Date(timestamp)
  if (Number.isNaN(targetDate.getTime())) {
    return "-"
  }

  const deltaMs = targetDate.getTime() - referenceNow
  if (Math.abs(deltaMs) >= DAY_IN_MS) {
    return formatDateTime(timestamp)
  }

  return formatTimeUntil(timestamp, referenceNow)
}
