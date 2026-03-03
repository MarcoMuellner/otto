import { access } from "node:fs/promises"
import path from "node:path"
import { homedir } from "node:os"
import { constants } from "node:fs"
import Database from "better-sqlite3"

const DEFAULT_INTERACTIVE_CONTEXT_LIMIT = 20
const MIN_INTERACTIVE_CONTEXT_LIMIT = 5
const MAX_INTERACTIVE_CONTEXT_LIMIT = 200
const INTERACTIVE_CONTEXT_MAX_LINE_LENGTH = 220

type ContextEventRow = {
  sourceLane: string
  sourceKind: string
  sourceRef: string | null
  content: string
  deliveryStatus: "queued" | "sent" | "failed" | "held"
  deliveryStatusDetail: string | null
  errorMessage: string | null
}

const normalizeWhitespace = (value: string): string => {
  return value.replaceAll(/\s+/g, " ").trim()
}

const shorten = (
  value: string,
  maxLength: number
): {
  value: string
  truncated: boolean
} => {
  if (value.length <= maxLength) {
    return { value, truncated: false }
  }

  return {
    value: `${value.slice(0, Math.max(0, maxLength - 3)).trim()}...`,
    truncated: true,
  }
}

const toStatusLabel = (status: "queued" | "sent" | "failed" | "held"): string => {
  if (status === "sent") {
    return "sent"
  }

  if (status === "failed") {
    return "failed"
  }

  if (status === "held") {
    return "held"
  }

  return "queued"
}

const normalizeInteractiveContextLimit = (input: unknown): number => {
  if (typeof input !== "number" || !Number.isInteger(input)) {
    return DEFAULT_INTERACTIVE_CONTEXT_LIMIT
  }

  return Math.max(MIN_INTERACTIVE_CONTEXT_LIMIT, Math.min(MAX_INTERACTIVE_CONTEXT_LIMIT, input))
}

const buildInteractiveContextPromptBlock = (
  events: ContextEventRow[]
): {
  block: string | null
  includedEvents: number
  truncated: boolean
} => {
  if (events.length === 0) {
    return {
      block: null,
      includedEvents: 0,
      truncated: false,
    }
  }

  const lines: string[] = []
  let truncated = false

  for (const event of events) {
    const sourceParts = [
      normalizeWhitespace(event.sourceLane),
      normalizeWhitespace(event.sourceKind),
    ]
      .filter((value) => value.length > 0)
      .join("/")
    const sourceRef = normalizeWhitespace(event.sourceRef ?? "")
    const source = sourceRef.length > 0 ? `${sourceParts}(${sourceRef})` : sourceParts
    const detail = normalizeWhitespace(event.deliveryStatusDetail ?? event.errorMessage ?? "")
    const content = normalizeWhitespace(event.content)
    if (content.length === 0) {
      continue
    }

    const summary = detail.length > 0 ? `${content} (${detail})` : content
    const shortened = shorten(summary, INTERACTIVE_CONTEXT_MAX_LINE_LENGTH)
    truncated = truncated || shortened.truncated
    lines.push(`- [${toStatusLabel(event.deliveryStatus)}] ${source}: ${shortened.value}`)
  }

  if (lines.length === 0) {
    return {
      block: null,
      includedEvents: 0,
      truncated,
    }
  }

  return {
    block: [
      "Recent non-interactive context:",
      ...lines,
      "Use this only as supporting context when it is relevant.",
    ].join("\n"),
    includedEvents: lines.length,
    truncated,
  }
}

const resolveSessionId = (input: unknown): string | null => {
  if (typeof input !== "object" || input === null) {
    return null
  }

  const record = input as Record<string, unknown>
  const directSessionId =
    typeof record.sessionID === "string"
      ? record.sessionID
      : typeof record.sessionId === "string"
        ? record.sessionId
        : null

  if (directSessionId && directSessionId.length > 0) {
    return directSessionId
  }

  const payload =
    typeof record.payload === "object" && record.payload !== null
      ? (record.payload as Record<string, unknown>)
      : null

  if (!payload) {
    return null
  }

  if (typeof payload.sessionID === "string" && payload.sessionID.length > 0) {
    return payload.sessionID
  }

  if (typeof payload.sessionId === "string" && payload.sessionId.length > 0) {
    return payload.sessionId
  }

  return null
}

const resolveDatabasePath = (): string => {
  const home = process.env.OTTO_HOME?.trim()
  if (home && home.length > 0) {
    return path.join(home, "data", "otto-state.db")
  }

  return path.join(homedir(), ".otto", "data", "otto-state.db")
}

const prependContextToOutput = (output: unknown, block: string): void => {
  if (typeof output !== "object" || output === null) {
    return
  }

  const record = output as Record<string, unknown>

  if (typeof record.prompt === "string") {
    record.prompt = `${block}\n\n${record.prompt}`
    return
  }

  if (typeof record.text === "string") {
    record.text = `${block}\n\n${record.text}`
    return
  }

  if (Array.isArray(record.parts)) {
    record.parts = [{ type: "text", text: block }, ...record.parts]
    return
  }

  const args =
    typeof record.args === "object" && record.args !== null
      ? (record.args as Record<string, unknown>)
      : null

  if (!args) {
    return
  }

  if (typeof args.prompt === "string") {
    args.prompt = `${block}\n\n${args.prompt}`
    return
  }

  if (typeof args.text === "string") {
    args.text = `${block}\n\n${args.text}`
    return
  }

  if (Array.isArray(args.parts)) {
    args.parts = [{ type: "text", text: block }, ...args.parts]
  }
}

const readInteractiveContextEvents = (
  databasePath: string,
  sourceSessionId: string
): ContextEventRow[] => {
  const db = new Database(databasePath, { readonly: true })

  try {
    const windowSizeRow = db
      .prepare(
        `SELECT interactive_context_window_size as interactiveContextWindowSize
         FROM user_profile
         WHERE id = 1`
      )
      .get() as
      | {
          interactiveContextWindowSize?: number
        }
      | undefined

    const windowSize = normalizeInteractiveContextLimit(windowSizeRow?.interactiveContextWindowSize)

    return db
      .prepare(
        `SELECT
           source_lane as sourceLane,
           source_kind as sourceKind,
           source_ref as sourceRef,
           content,
           delivery_status as deliveryStatus,
           delivery_status_detail as deliveryStatusDetail,
           error_message as errorMessage
         FROM interactive_context_events
         WHERE source_session_id = ?
         ORDER BY created_at DESC, id DESC
         LIMIT ?`
      )
      .all(sourceSessionId, windowSize) as ContextEventRow[]
  } finally {
    db.close()
  }
}

export const TuiInteractiveContextPlugin = async () => {
  return {
    "tui.prompt.append": async (input: unknown, output: unknown) => {
      try {
        const sourceSessionId = resolveSessionId(input)
        if (!sourceSessionId) {
          return
        }

        const databasePath = resolveDatabasePath()
        await access(databasePath, constants.F_OK)

        const events = readInteractiveContextEvents(databasePath, sourceSessionId)
        const formatted = buildInteractiveContextPromptBlock(events)

        if (!formatted.block) {
          return
        }

        prependContextToOutput(output, formatted.block)
      } catch {
        return
      }
    },
  }
}
