import type { DoctorCheckResult, DoctorSeverity, DoctorVerdict } from "./contracts.js"

export const mapDoctorSeverityToVerdict = (severity: DoctorSeverity): DoctorVerdict => {
  if (severity === "error") {
    return "red"
  }

  if (severity === "warning") {
    return "yellow"
  }

  return "green"
}

/**
 * Collapses check-level severities into one top-level verdict so CLI exit behavior remains
 * stable regardless of the number of checks added in later tickets.
 */
export const rollupDoctorVerdict = (checks: readonly DoctorCheckResult[]): DoctorVerdict => {
  let verdict: DoctorVerdict = "green"

  for (const check of checks) {
    const checkVerdict = mapDoctorSeverityToVerdict(check.severity)

    if (checkVerdict === "red") {
      return "red"
    }

    if (checkVerdict === "yellow") {
      verdict = "yellow"
    }
  }

  return verdict
}

export const mapDoctorRunVerdict = (
  checks: readonly DoctorCheckResult[],
  internalFailure: boolean
): DoctorVerdict => {
  if (internalFailure) {
    return "red"
  }

  return rollupDoctorVerdict(checks)
}
