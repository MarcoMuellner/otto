import type {
  DoctorCheckResult,
  DoctorRunResult,
  DoctorSeverity,
  DoctorVerdict,
} from "../contracts.js"

type RenderDoctorTerminalOutputInput = {
  result: DoctorRunResult
  incidentPath?: string | null
  incidentWriteError?: string | null
}

const RESET = "\u001B[0m"
const BOLD = "\u001B[1m"
const DIM = "\u001B[2m"
const FG_GREEN = "\u001B[32m"
const FG_YELLOW = "\u001B[33m"
const FG_RED = "\u001B[31m"
const FG_CYAN = "\u001B[36m"
const FG_WHITE = "\u001B[37m"

const isColorEnabled = (): boolean => {
  return process.stdout.isTTY === true && process.env.NO_COLOR !== "1"
}

const paint = (
  value: string,
  color: string,
  options?: { bold?: boolean; dim?: boolean }
): string => {
  if (!isColorEnabled()) {
    return value
  }

  const prefixes = [color]
  if (options?.bold) {
    prefixes.push(BOLD)
  }
  if (options?.dim) {
    prefixes.push(DIM)
  }

  return `${prefixes.join("")}${value}${RESET}`
}

const verdictLabel: Record<DoctorVerdict, string> = {
  green: "GREEN",
  yellow: "YELLOW",
  red: "RED",
}

const severityLabel: Record<DoctorSeverity, string> = {
  ok: "OK",
  warning: "WARN",
  error: "ERR",
}

const verdictColor: Record<DoctorVerdict, string> = {
  green: FG_GREEN,
  yellow: FG_YELLOW,
  red: FG_RED,
}

const severityColor: Record<DoctorSeverity, string> = {
  ok: FG_GREEN,
  warning: FG_YELLOW,
  error: FG_RED,
}

const isSkippedCheck = (check: DoctorCheckResult): boolean => {
  return check.evidence.some((entry) => entry.code.includes("SKIPPED"))
}

const summarizeTier = (result: DoctorRunResult, tier: "fast" | "deep"): string => {
  const checks = result.checks.filter((check) => check.tier === tier)
  if (checks.length === 0) {
    return `${tier}: not-run`
  }

  const okCount = checks.filter((check) => check.severity === "ok").length
  const warningCount = checks.filter((check) => check.severity === "warning").length
  const errorCount = checks.filter((check) => check.severity === "error").length
  const skippedCount = checks.filter((check) => isSkippedCheck(check)).length
  return `${tier}: total=${checks.length} ok=${okCount} warn=${warningCount} err=${errorCount} skipped=${skippedCount}`
}

const formatRemediationHint = (code: string): string | null => {
  if (code.includes("AUTH") || code.includes("TOKEN")) {
    return "verify API token/env and restart runtime"
  }

  if (
    code.includes("UNREACHABLE") ||
    code.includes("HTTP_ERROR") ||
    code.includes("STATUS_UNEXPECTED")
  ) {
    return "verify local runtime is up and API endpoint is reachable"
  }

  if (code.includes("TIMEOUT")) {
    return "retry doctor and inspect runtime load or network latency"
  }

  if (code.includes("REQUIREMENT_")) {
    return "install missing requirement and rerun doctor --deep"
  }

  if (code.includes("CLEANUP") || code.includes("RESIDUAL") || code.includes("PROBE")) {
    return "inspect deep probe evidence and confirm cleanup contracts"
  }

  if (code.includes("CLI_SMOKE")) {
    return "run ottoctl task/model/extension commands manually to verify CLI"
  }

  return null
}

const collectRemediationHints = (result: DoctorRunResult): string[] => {
  const hints = new Set<string>()

  for (const check of result.checks) {
    for (const evidence of check.evidence) {
      const hint = formatRemediationHint(evidence.code)
      if (hint) {
        hints.add(hint)
      }
    }
  }

  if (result.internalFailure) {
    hints.add("inspect ENGINE_FAILURE details and rerun doctor for reproducibility")
  }

  return [...hints]
}

const formatProblemCheck = (check: DoctorCheckResult): string => {
  const firstEvidence = check.evidence[0]
  const codePart = firstEvidence ? ` (${firstEvidence.code})` : ""
  const skipped = isSkippedCheck(check) ? " [skipped]" : ""
  const badge = paint(`[${severityLabel[check.severity]}]`, severityColor[check.severity], {
    bold: true,
  })
  return `- ${badge} ${check.id}${skipped}${codePart}: ${check.summary}`
}

/**
 * Renders a deterministic terminal summary for doctor runs so operators can decide quickly
 * whether the system is safe to proceed and where to investigate next.
 */
export const renderDoctorTerminalOutput = (input: RenderDoctorTerminalOutputInput): string => {
  const { result } = input
  const lines: string[] = []
  const divider = paint("------------------------------------------------------------", FG_WHITE, {
    dim: true,
  })
  const verdict = paint(verdictLabel[result.verdict], verdictColor[result.verdict], { bold: true })

  lines.push(paint("OTTO DOCTOR", FG_CYAN, { bold: true }))
  lines.push(divider)
  lines.push(`Doctor verdict: ${verdict}`)
  lines.push(
    `Mode: ${result.mode} | Duration: ${result.durationMs}ms | Checks: ${result.checks.length} | Internal failure: ${result.internalFailure ? "yes" : "no"}`
  )
  lines.push(`Phase summary: ${summarizeTier(result, "fast")} | ${summarizeTier(result, "deep")}`)

  const problemChecks = result.checks.filter(
    (check) => check.severity !== "ok" || isSkippedCheck(check)
  )

  if (problemChecks.length > 0) {
    lines.push("")
    lines.push("Problems:")
    for (const check of problemChecks) {
      lines.push(formatProblemCheck(check))
    }
  }

  const hints = collectRemediationHints(result)
  if (hints.length > 0) {
    lines.push("")
    lines.push("Remediation hints:")
    for (const hint of hints.slice(0, 4)) {
      lines.push(`- ${hint}`)
    }
  }

  if (input.incidentPath) {
    lines.push("")
    lines.push(`Incident report: ${input.incidentPath}`)
  }

  if (input.incidentWriteError) {
    lines.push("")
    lines.push(`Incident report error: ${input.incidentWriteError}`)
  }

  lines.push(divider)

  return lines.join("\n")
}
