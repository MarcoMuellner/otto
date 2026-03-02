import { describe, expect, it, vi } from "vitest"

import type { DoctorRunResult } from "../../src/doctor/contracts.js"
import { buildDoctorIncidentMarkdown } from "../../src/doctor/report/incident-markdown.js"

const createResult = (): DoctorRunResult => {
  return {
    mode: "deep",
    verdict: "red",
    internalFailure: false,
    startedAt: "2026-03-02T10:00:00.000Z",
    finishedAt: "2026-03-02T10:00:02.000Z",
    durationMs: 2_000,
    checks: [
      {
        id: "fast.external.connectivity",
        phase: "fast.core",
        tier: "fast",
        severity: "error",
        summary: "Connectivity probe failed",
        durationMs: 150,
        timedOut: false,
        evidence: [
          {
            code: "EXTERNAL_API_UNREACHABLE",
            message: "Connection refused",
            details: {
              endpoint: "/external/health",
              durationMs: 150,
            },
          },
        ],
      },
    ],
  }
}

describe("buildDoctorIncidentMarkdown", () => {
  it("renders run context, repro command, and problem checks", () => {
    // Arrange
    const result = createResult()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-03-02T12:00:00.000Z"))

    try {
      // Act
      const markdown = buildDoctorIncidentMarkdown(result)

      // Assert
      expect(markdown).toContain("# Otto Doctor Incident")
      expect(markdown).toContain("- Mode: deep")
      expect(markdown).toContain("- Verdict: red")
      expect(markdown).toContain("ottoctl doctor --deep")
      expect(markdown).toContain("### fast.external.connectivity")
      expect(markdown).toContain("[EXTERNAL_API_UNREACHABLE] Connection refused")
      expect(markdown).toContain('"endpoint": "/external/health"')
    } finally {
      vi.useRealTimers()
    }
  })

  it("includes internal failure details when present", () => {
    // Arrange
    const result = createResult()
    result.internalFailure = true
    result.failure = {
      code: "ENGINE_FAILURE",
      message: "Unhandled error",
      details: {
        component: "doctor-engine",
      },
    }

    // Act
    const markdown = buildDoctorIncidentMarkdown(result)

    // Assert
    expect(markdown).toContain("## Internal Failure")
    expect(markdown).toContain("- Code: ENGINE_FAILURE")
    expect(markdown).toContain("- Message: Unhandled error")
    expect(markdown).toContain('"component": "doctor-engine"')
  })
})
