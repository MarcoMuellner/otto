import { describe, expect, it } from "vitest"

import type { DoctorRunResult } from "../../src/doctor/contracts.js"
import { redactDoctorRunResult } from "../../src/doctor/redaction.js"

const createBaseResult = (): DoctorRunResult => {
  return {
    mode: "deep",
    verdict: "red",
    internalFailure: false,
    startedAt: "2026-03-02T10:00:00.000Z",
    finishedAt: "2026-03-02T10:00:10.000Z",
    durationMs: 10_000,
    checks: [
      {
        id: "fast.external.connectivity",
        phase: "fast.core",
        tier: "fast",
        severity: "error",
        summary: "External API auth failed for Bearer super-secret-token",
        durationMs: 120,
        timedOut: false,
        evidence: [
          {
            code: "EXTERNAL_API_AUTH_FAILED",
            message: "Authorization failed with token=raw-token-value",
            details: {
              authorization: "Bearer abcdef123456",
              token: "plain-token",
              endpoint: "http://localhost:4190/external/health?token=query-token",
            },
          },
        ],
      },
    ],
  }
}

describe("redactDoctorRunResult", () => {
  it("redacts sensitive values in summary, messages, and details", () => {
    // Arrange
    const result = createBaseResult()

    // Act
    const redacted = redactDoctorRunResult(result)

    // Assert
    const serialized = JSON.stringify(redacted)
    expect(serialized).not.toContain("super-secret-token")
    expect(serialized).not.toContain("raw-token-value")
    expect(serialized).not.toContain("abcdef123456")
    expect(serialized).not.toContain("plain-token")
    expect(serialized).not.toContain("query-token")
    expect(serialized).toContain("[REDACTED]")
  })

  it("preserves non-sensitive diagnostics", () => {
    // Arrange
    const result = createBaseResult()

    // Act
    const redacted = redactDoctorRunResult(result)

    // Assert
    expect(redacted.checks[0].id).toBe("fast.external.connectivity")
    expect(redacted.checks[0].phase).toBe("fast.core")
    expect(redacted.checks[0].evidence[0]?.code).toBe("EXTERNAL_API_AUTH_FAILED")
  })
})
