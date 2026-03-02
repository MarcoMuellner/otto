import { describe, expect, it } from "vitest"

import {
  mapDoctorRunVerdict,
  mapDoctorSeverityToVerdict,
  rollupDoctorVerdict,
} from "../../src/doctor/verdict.js"
import type { DoctorCheckResult } from "../../src/doctor/contracts.js"

const createCheck = (severity: "ok" | "warning" | "error"): DoctorCheckResult => ({
  id: `${severity}-check`,
  phase: "phase-1",
  tier: "fast",
  severity,
  summary: `${severity} summary`,
  evidence: [],
  durationMs: 0,
  timedOut: false,
})

describe("mapDoctorSeverityToVerdict", () => {
  it("maps ok severity to green", () => {
    expect(mapDoctorSeverityToVerdict("ok")).toBe("green")
  })

  it("maps warning severity to yellow", () => {
    expect(mapDoctorSeverityToVerdict("warning")).toBe("yellow")
  })

  it("maps error severity to red", () => {
    expect(mapDoctorSeverityToVerdict("error")).toBe("red")
  })
})

describe("rollupDoctorVerdict", () => {
  it("returns green when all checks are ok", () => {
    expect(rollupDoctorVerdict([createCheck("ok"), createCheck("ok")])).toBe("green")
  })

  it("returns yellow when any check is warning and none are error", () => {
    expect(rollupDoctorVerdict([createCheck("ok"), createCheck("warning")])).toBe("yellow")
  })

  it("returns red when any check is error", () => {
    expect(rollupDoctorVerdict([createCheck("warning"), createCheck("error")])).toBe("red")
  })
})

describe("mapDoctorRunVerdict", () => {
  it("returns red when internal failure is true", () => {
    expect(mapDoctorRunVerdict([createCheck("ok")], true)).toBe("red")
  })

  it("delegates to check rollup when internal failure is false", () => {
    expect(mapDoctorRunVerdict([createCheck("warning")], false)).toBe("yellow")
  })
})
