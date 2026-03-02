import type { DoctorCheckResult, DoctorRunResult } from "../contracts.js"

const isProblemCheck = (check: DoctorCheckResult): boolean => {
  return check.severity !== "ok" || check.evidence.some((entry) => entry.code.includes("SKIPPED"))
}

const renderEvidenceDetails = (details: Record<string, unknown> | undefined): string => {
  if (!details) {
    return ""
  }

  return `\n\n\`\`\`json\n${JSON.stringify(details, null, 2)}\n\`\`\``
}

const renderCheckSection = (check: DoctorCheckResult): string => {
  const lines: string[] = []
  lines.push(`### ${check.id}`)
  lines.push("")
  lines.push(`- Phase: ${check.phase}`)
  lines.push(`- Tier: ${check.tier}`)
  lines.push(`- Severity: ${check.severity}`)
  lines.push(`- Duration: ${check.durationMs}ms`)
  lines.push(`- Timed out: ${check.timedOut ? "yes" : "no"}`)
  lines.push(`- Summary: ${check.summary}`)
  lines.push("")

  if (check.evidence.length === 0) {
    lines.push("No evidence entries were recorded.")
    lines.push("")
    return lines.join("\n")
  }

  lines.push("Evidence:")
  lines.push("")
  for (const evidence of check.evidence) {
    lines.push(`- [${evidence.code}] ${evidence.message}${renderEvidenceDetails(evidence.details)}`)
  }
  lines.push("")
  return lines.join("\n")
}

/**
 * Builds a local incident markdown document for non-green doctor runs so operators can share
 * one reproducible artifact without re-running probes during incident handling.
 */
export const buildDoctorIncidentMarkdown = (result: DoctorRunResult): string => {
  const command = result.mode === "deep" ? "ottoctl doctor --deep" : "ottoctl doctor"
  const problemChecks = result.checks.filter((check) => isProblemCheck(check))

  const lines: string[] = [
    "# Otto Doctor Incident",
    "",
    "## Run Context",
    "",
    `- Generated at: ${new Date().toISOString()}`,
    `- Mode: ${result.mode}`,
    `- Verdict: ${result.verdict}`,
    `- Internal failure: ${result.internalFailure ? "yes" : "no"}`,
    `- Duration: ${result.durationMs}ms`,
    `- Started at: ${result.startedAt}`,
    `- Finished at: ${result.finishedAt}`,
    `- Checks executed: ${result.checks.length}`,
    "",
    "## Reproduction",
    "",
    "```bash",
    command,
    "```",
    "",
  ]

  if (result.failure) {
    lines.push("## Internal Failure")
    lines.push("")
    lines.push(`- Code: ${result.failure.code}`)
    lines.push(`- Message: ${result.failure.message}`)
    if (result.failure.details) {
      lines.push("")
      lines.push("```json")
      lines.push(JSON.stringify(result.failure.details, null, 2))
      lines.push("```")
    }
    lines.push("")
  }

  lines.push("## Problem Checks")
  lines.push("")

  if (problemChecks.length === 0) {
    lines.push("No warning/error/skipped checks were recorded.")
    lines.push("")
  } else {
    for (const check of problemChecks) {
      lines.push(renderCheckSection(check))
    }
  }

  return `${lines.join("\n").trim()}\n`
}
