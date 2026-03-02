import { describe, expect, it } from "vitest"

import {
  createDoctorProbeRegistry,
  evaluateDoctorProbeGate,
} from "../../src/doctor/probes/registry.js"

describe("doctor probe contracts", () => {
  it("registers valid probe contracts", () => {
    // Arrange
    const probes = [
      {
        id: "probe.google-calendar.read",
        mutating: false,
        cleanupRequired: false,
        cleanupGuaranteed: false,
      },
      {
        id: "probe.anylist.write",
        mutating: true,
        cleanupRequired: true,
        cleanupGuaranteed: true,
        lockKey: "integration:anylist",
      },
    ]

    // Act
    const registry = createDoctorProbeRegistry(probes)

    // Assert
    expect(registry).toHaveLength(2)
    expect(registry[1]).toMatchObject({
      id: "probe.anylist.write",
      lockKey: "integration:anylist",
    })
  })

  it("returns normalized contracts from schema parsing", () => {
    // Arrange
    const probes = [
      {
        id: "  probe.trimmed-id  ",
        mutating: true,
        cleanupRequired: true,
        cleanupGuaranteed: true,
        lockKey: "  integration:trimmed  ",
      },
    ]

    // Act
    const registry = createDoctorProbeRegistry(probes)

    // Assert
    expect(registry[0]).toEqual({
      id: "probe.trimmed-id",
      mutating: true,
      cleanupRequired: true,
      cleanupGuaranteed: true,
      lockKey: "integration:trimmed",
    })
  })

  it("rejects duplicate probe ids", () => {
    // Arrange
    const probes = [
      {
        id: "probe.duplicate",
        mutating: false,
        cleanupRequired: false,
        cleanupGuaranteed: false,
      },
      {
        id: "probe.duplicate",
        mutating: true,
        cleanupRequired: true,
        cleanupGuaranteed: true,
      },
    ]

    // Act + Assert
    expect(() => createDoctorProbeRegistry(probes)).toThrow("Duplicate id: 'probe.duplicate'")
  })

  it("skips probes when cleanup is required but not guaranteed", () => {
    // Arrange
    const probe = {
      id: "probe.integration.write",
      mutating: true,
      cleanupRequired: true,
      cleanupGuaranteed: false,
      lockKey: "integration:write",
    }

    // Act
    const decision = evaluateDoctorProbeGate(probe)

    // Assert
    expect(decision.allowed).toBe(false)
    expect(decision.skipReason).toMatchObject({
      code: "PROBE_SKIPPED_CLEANUP_NOT_GUARANTEED",
    })
  })

  it("allows probes when cleanup is guaranteed", () => {
    // Arrange
    const probe = {
      id: "probe.integration.safe-write",
      mutating: true,
      cleanupRequired: true,
      cleanupGuaranteed: true,
      lockKey: "integration:safe-write",
    }

    // Act
    const decision = evaluateDoctorProbeGate(probe)

    // Assert
    expect(decision).toEqual({
      allowed: true,
      skipReason: null,
    })
  })
})
