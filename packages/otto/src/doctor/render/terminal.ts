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
  return `- ${severityLabel[check.severity]} ${check.id}${skipped}${codePart}: ${check.summary}`
}

/**
 * Renders a deterministic terminal summary for doctor runs so operators can decide quickly
 * whether the system is safe to proceed and where to investigate next.
 */
export const renderDoctorTerminalOutput = (input: RenderDoctorTerminalOutputInput): string => {
  const { result } = input
  const lines: string[] = []

  lines.push(`Doctor verdict: ${verdictLabel[result.verdict]}`)
  lines.push(
    `Mode: ${result.mode} | Duration: ${result.durationMs}ms | Checks: ${result.checks.length} | Internal failure: ${result.internalFailure ? "yes" : "no"}`
  )
  lines.push(`Phase summary: ${summarizeTier(result, "fast")} | ${summarizeTier(result, "deep")}`)

  const problemChecks = result.checks.filter(
    (check) => check.severity !== "ok" || isSkippedCheck(check)
  )

  if (problemChecks.length > 0) {
    lines.push("Problems:")
    for (const check of problemChecks) {
      lines.push(formatProblemCheck(check))
    }
  }

  const hints = collectRemediationHints(result)
  if (hints.length > 0) {
    lines.push("Remediation hints:")
    for (const hint of hints.slice(0, 4)) {
      lines.push(`- ${hint}`)
    }
  }

  if (input.incidentPath) {
    lines.push(`Incident report: ${input.incidentPath}`)
  }

  if (input.incidentWriteError) {
    lines.push(`Incident report error: ${input.incidentWriteError}`)
  }

  return lines.join("\n")
}
