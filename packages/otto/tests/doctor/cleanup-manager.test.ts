import { describe, expect, it } from "vitest"

import { createDoctorCleanupManager } from "../../src/doctor/probes/cleanup-manager.js"

describe("doctor cleanup manager", () => {
  it("runs cleanup steps in reverse registration order", async () => {
    // Arrange
    const manager = createDoctorCleanupManager()
    const order: string[] = []

    manager.addStep({
      id: "first",
      run: async () => {
        order.push("first")
      },
    })
    manager.addStep({
      id: "second",
      run: async () => {
        order.push("second")
      },
    })

    // Act
    const result = await manager.run()

    // Assert
    expect(result.ok).toBe(true)
    expect(order).toEqual(["second", "first"])
  })

  it("captures step failure and continues remaining cleanup", async () => {
    // Arrange
    const manager = createDoctorCleanupManager()
    const order: string[] = []

    manager.addStep({
      id: "first",
      run: async () => {
        order.push("first")
      },
    })
    manager.addStep({
      id: "second",
      run: async () => {
        order.push("second")
        throw new Error("boom")
      },
    })

    // Act
    const result = await manager.run()

    // Assert
    expect(result.ok).toBe(false)
    expect(order).toEqual(["second", "first"])
    expect(result.evidence.some((entry) => entry.code === "PROBE_CLEANUP_STEP_RUN_FAILED")).toBe(
      true
    )
  })

  it("runs verification after successful cleanup step", async () => {
    // Arrange
    const manager = createDoctorCleanupManager()
    const phases: string[] = []

    manager.addStep({
      id: "cleanup",
      run: async () => {
        phases.push("run")
      },
      verify: async () => {
        phases.push("verify")
      },
    })

    // Act
    const result = await manager.run()

    // Assert
    expect(result.ok).toBe(true)
    expect(phases).toEqual(["run", "verify"])
    expect(result.evidence.some((entry) => entry.code === "PROBE_CLEANUP_STEP_VERIFY_OK")).toBe(
      true
    )
  })
})
