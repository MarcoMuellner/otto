import type { DoctorEvidence, DoctorRunResult } from "./contracts.js"

const REDACTED_VALUE = "[REDACTED]"

const SENSITIVE_KEY_PATTERN = /(token|secret|password|api[_-]?key|authorization|bearer)/i

const redactInlineString = (value: string): string => {
  return value
    .replace(/(Bearer\s+)[^\s"']+/gi, `$1${REDACTED_VALUE}`)
    .replace(
      /([?&](?:token|secret|password|api[_-]?key|authorization)=)[^&#\s]+/gi,
      `$1${REDACTED_VALUE}`
    )
    .replace(
      /((?:token|secret|password|api[_-]?key|authorization)\s*[:=]\s*)([^,\s\]}"']+)/gi,
      `$1${REDACTED_VALUE}`
    )
}

const redactUnknownValue = (value: unknown): unknown => {
  if (typeof value === "string") {
    return redactInlineString(value)
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redactUnknownValue(entry))
  }

  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>
    const redactedEntries = Object.entries(source).map(([key, entryValue]) => {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        return [key, REDACTED_VALUE]
      }

      return [key, redactUnknownValue(entryValue)]
    })

    return Object.fromEntries(redactedEntries)
  }

  return value
}

const redactEvidence = (evidence: DoctorEvidence): DoctorEvidence => {
  return {
    ...evidence,
    message: redactInlineString(evidence.message),
    ...(evidence.details
      ? { details: redactUnknownValue(evidence.details) as Record<string, unknown> }
      : {}),
  }
}

/**
 * Sanitizes doctor output payloads before terminal rendering and incident persistence so
 * operational diagnostics stay useful without leaking credentials or bearer material.
 */
export const redactDoctorRunResult = (result: DoctorRunResult): DoctorRunResult => {
  return {
    ...result,
    checks: result.checks.map((check) => ({
      ...check,
      summary: redactInlineString(check.summary),
      evidence: check.evidence.map((entry) => redactEvidence(entry)),
    })),
    ...(result.failure
      ? {
          failure: {
            ...result.failure,
            message: redactInlineString(result.failure.message),
            ...(result.failure.details
              ? {
                  details: redactUnknownValue(result.failure.details) as Record<string, unknown>,
                }
              : {}),
          },
        }
      : {}),
  }
}
