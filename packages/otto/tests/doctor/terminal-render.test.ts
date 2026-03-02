import { describe, expect, it } from "vitest"

import type { DoctorRunResult } from "../../src/doctor/contracts.js"
import { renderDoctorTerminalOutput } from "../../src/doctor/render/terminal.js"

const createGreenResult = (): DoctorRunResult => {
  return {
    mode: "fast",
    verdict: "green",
    internalFailure: false,
    startedAt: "2026-03-02T10:00:00.000Z",
    finishedAt: "2026-03-02T10:00:01.000Z",
    durationMs: 1_000,
    checks: [
      {
        id: "fast.external.connectivity",
        phase: "fast.core",
        tier: "fast",
        severity: "ok",
        summary: "Connectivity healthy",
        durationMs: 100,
        timedOut: false,
        evidence: [{ code: "EXTERNAL_API_HEALTH_OK", message: "Health ok" }],
      },
    ],
  }
}

describe("renderDoctorTerminalOutput", () => {
  it("renders decisive green output", () => {
    // Arrange
    const result = createGreenResult()

    // Act
    const output = renderDoctorTerminalOutput({ result })

    // Assert
    expect(output).toContain("Doctor verdict: GREEN")
    expect(output).toContain("Mode: fast")
    expect(output).not.toContain("Problems:")
    expect(output).not.toContain("Incident report:")
  })

  it("renders warnings/errors, hints, and incident path", () => {
    // Arrange
    const result = createGreenResult()
    result.mode = "deep"
    result.verdict = "red"
    result.checks.push({
      id: "deep.job.pipeline",
      phase: "deep.runtime",
      tier: "deep",
      severity: "error",
      summary: "Job pipeline probe failed",
      durationMs: 1_200,
      timedOut: false,
      evidence: [
        {
          code: "DEEP_JOB_PROBE_FAILED",
          message: "Probe failed",
        },
      ],
    })

    // Act
    const output = renderDoctorTerminalOutput({
      result,
      incidentPath: "/tmp/doctor-incident.md",
    })

    // Assert
    expect(output).toContain("Doctor verdict: RED")
    expect(output).toContain("Problems:")
    expect(output).toContain("deep.job.pipeline")
    expect(output).toContain("Remediation hints:")
    expect(output).toContain("Incident report: /tmp/doctor-incident.md")
  })
})
