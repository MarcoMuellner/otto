import { describe, expect, it } from "vitest"

import { runDoctorEngine } from "../../src/doctor/engine.js"
import type { DoctorCheckDefinition } from "../../src/doctor/contracts.js"

type Deferred = {
  promise: Promise<void>
  resolve: () => void
}

const createDeferred = (): Deferred => {
  let resolve = (): void => {
    throw new Error("Deferred resolver not initialized")
  }

  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise
  })

  return {
    promise,
    resolve,
  }
}

describe("runDoctorEngine", () => {
  it("runs only fast-tier checks in fast mode", async () => {
    // Arrange
    const executedChecks: string[] = []
    const checks: DoctorCheckDefinition[] = [
      {
        id: "fast-check",
        phase: "phase-1",
        tier: "fast",
        run: async () => {
          executedChecks.push("fast-check")
          return {
            severity: "ok",
            summary: "fast ok",
            evidence: [],
          }
        },
      },
      {
        id: "deep-check",
        phase: "phase-1",
        tier: "deep",
        run: async () => {
          executedChecks.push("deep-check")
          return {
            severity: "ok",
            summary: "deep ok",
            evidence: [],
          }
        },
      },
    ]

    // Act
    const result = await runDoctorEngine({
      mode: "fast",
      checks,
    })

    // Assert
    expect(executedChecks).toEqual(["fast-check"])
    expect(result.checks.map((check) => check.id)).toEqual(["fast-check"])
    expect(result.verdict).toBe("green")
    expect(result.internalFailure).toBe(false)
  })

  it("runs fast and deep checks in deep mode", async () => {
    // Arrange
    const executedChecks: string[] = []
    const checks: DoctorCheckDefinition[] = [
      {
        id: "fast-check",
        phase: "phase-1",
        tier: "fast",
        run: async () => {
          executedChecks.push("fast-check")
          return {
            severity: "ok",
            summary: "fast ok",
            evidence: [],
          }
        },
      },
      {
        id: "deep-check",
        phase: "phase-1",
        tier: "deep",
        run: async () => {
          executedChecks.push("deep-check")
          return {
            severity: "ok",
            summary: "deep ok",
            evidence: [],
          }
        },
      },
    ]

    // Act
    const result = await runDoctorEngine({
      mode: "deep",
      checks,
    })

    // Assert
    expect(executedChecks).toEqual(["fast-check", "deep-check"])
    expect(result.checks.map((check) => check.id)).toEqual(["fast-check", "deep-check"])
    expect(result.verdict).toBe("green")
  })

  it("enforces phase ordering while allowing phase-local execution", async () => {
    // Arrange
    const phaseOneRelease = createDeferred()
    const events: string[] = []
    const checks: DoctorCheckDefinition[] = [
      {
        id: "phase-one",
        phase: "phase-1",
        tier: "fast",
        run: async () => {
          events.push("phase-one:start")
          await phaseOneRelease.promise
          events.push("phase-one:end")
          return {
            severity: "ok",
            summary: "phase one done",
            evidence: [],
          }
        },
      },
      {
        id: "phase-two",
        phase: "phase-2",
        tier: "fast",
        run: async () => {
          events.push("phase-two:start")
          return {
            severity: "ok",
            summary: "phase two done",
            evidence: [],
          }
        },
      },
    ]

    // Act
    const runPromise = runDoctorEngine({
      mode: "fast",
      checks,
    })

    await Promise.resolve()

    // Assert
    expect(events).toEqual(["phase-one:start"])

    // Act
    phaseOneRelease.resolve()
    await runPromise

    // Assert
    expect(events).toEqual(["phase-one:start", "phase-one:end", "phase-two:start"])
  })

  it("runs independent checks in parallel within a phase", async () => {
    // Arrange
    const release = createDeferred()
    const firstStarted = createDeferred()
    const secondStarted = createDeferred()
    let activeChecks = 0
    let maxActiveChecks = 0

    const createCheck = (id: string, started: Deferred): DoctorCheckDefinition => ({
      id,
      phase: "phase-1",
      tier: "fast",
      run: async () => {
        activeChecks += 1
        maxActiveChecks = Math.max(maxActiveChecks, activeChecks)
        started.resolve()
        await release.promise
        activeChecks -= 1

        return {
          severity: "ok",
          summary: `${id} completed`,
          evidence: [],
        }
      },
    })

    const checks: DoctorCheckDefinition[] = [
      createCheck("check-a", firstStarted),
      createCheck("check-b", secondStarted),
    ]

    // Act
    const runPromise = runDoctorEngine({
      mode: "fast",
      checks,
    })

    await Promise.all([firstStarted.promise, secondStarted.promise])

    // Assert
    expect(maxActiveChecks).toBe(2)

    // Act
    release.resolve()
    await runPromise
  })

  it("serializes checks sharing the same lock key", async () => {
    // Arrange
    const releaseFirst = createDeferred()
    const events: string[] = []
    let activeChecks = 0
    let maxActiveChecks = 0
    const checks: DoctorCheckDefinition[] = [
      {
        id: "locked-a",
        phase: "phase-1",
        tier: "fast",
        lockKey: "integration:slack",
        run: async () => {
          events.push("locked-a:start")
          activeChecks += 1
          maxActiveChecks = Math.max(maxActiveChecks, activeChecks)
          await releaseFirst.promise
          activeChecks -= 1
          events.push("locked-a:end")

          return {
            severity: "ok",
            summary: "locked a done",
            evidence: [],
          }
        },
      },
      {
        id: "locked-b",
        phase: "phase-1",
        tier: "fast",
        lockKey: "integration:slack",
        run: async () => {
          events.push("locked-b:start")
          activeChecks += 1
          maxActiveChecks = Math.max(maxActiveChecks, activeChecks)
          activeChecks -= 1
          events.push("locked-b:end")

          return {
            severity: "ok",
            summary: "locked b done",
            evidence: [],
          }
        },
      },
    ]

    // Act
    const runPromise = runDoctorEngine({
      mode: "fast",
      checks,
    })
    await Promise.resolve()

    // Assert
    expect(events).toEqual(["locked-a:start"])
    expect(maxActiveChecks).toBe(1)

    // Act
    releaseFirst.resolve()
    await runPromise

    // Assert
    expect(events).toEqual(["locked-a:start", "locked-a:end", "locked-b:start", "locked-b:end"])
    expect(maxActiveChecks).toBe(1)
  })

  it("keeps lock serialization after timeout until the timed-out check settles", async () => {
    // Arrange
    const releaseFirst = createDeferred()
    const events: string[] = []
    const checks: DoctorCheckDefinition[] = [
      {
        id: "locked-timeout-a",
        phase: "phase-1",
        tier: "fast",
        lockKey: "integration:notion",
        timeoutMs: 5,
        run: async () => {
          events.push("locked-timeout-a:start")
          await releaseFirst.promise
          events.push("locked-timeout-a:end")

          return {
            severity: "ok",
            summary: "should still be timeout",
            evidence: [],
          }
        },
      },
      {
        id: "locked-timeout-b",
        phase: "phase-1",
        tier: "fast",
        lockKey: "integration:notion",
        run: async () => {
          events.push("locked-timeout-b:start")
          events.push("locked-timeout-b:end")

          return {
            severity: "ok",
            summary: "second lock check",
            evidence: [],
          }
        },
      },
    ]

    // Act
    const runPromise = runDoctorEngine({
      mode: "fast",
      checks,
    })

    await new Promise((resolve) => setTimeout(resolve, 15))

    // Assert
    expect(events).toEqual(["locked-timeout-a:start"])

    // Act
    releaseFirst.resolve()
    const result = await runPromise

    // Assert
    expect(events).toEqual([
      "locked-timeout-a:start",
      "locked-timeout-a:end",
      "locked-timeout-b:start",
      "locked-timeout-b:end",
    ])
    expect(result.checks[0]).toMatchObject({
      id: "locked-timeout-a",
      timedOut: true,
      severity: "error",
    })
  })

  it("normalizes timed out checks into deterministic red results", async () => {
    // Arrange
    const checks: DoctorCheckDefinition[] = [
      {
        id: "timeout-check",
        phase: "phase-1",
        tier: "fast",
        timeoutMs: 5,
        run: async () => {
          await new Promise((resolve) => setTimeout(resolve, 25))

          return {
            severity: "ok",
            summary: "should time out",
            evidence: [],
          }
        },
      },
    ]

    // Act
    const result = await runDoctorEngine({
      mode: "fast",
      checks,
    })

    // Assert
    expect(result.verdict).toBe("red")
    expect(result.internalFailure).toBe(false)
    expect(result.checks).toHaveLength(1)
    expect(result.checks[0]).toMatchObject({
      id: "timeout-check",
      severity: "error",
      timedOut: true,
    })
    expect(result.checks[0].evidence[0]).toMatchObject({
      code: "TIMEOUT",
    })
  })

  it("returns deterministic check ordering", async () => {
    // Arrange
    const checks: DoctorCheckDefinition[] = [
      {
        id: "slow-check",
        phase: "phase-1",
        tier: "fast",
        run: async () => {
          await new Promise((resolve) => setTimeout(resolve, 20))

          return {
            severity: "ok",
            summary: "slow done",
            evidence: [],
          }
        },
      },
      {
        id: "fast-check",
        phase: "phase-1",
        tier: "fast",
        run: async () => {
          return {
            severity: "ok",
            summary: "fast done",
            evidence: [],
          }
        },
      },
    ]

    // Act
    const result = await runDoctorEngine({
      mode: "fast",
      checks,
    })

    // Assert
    expect(result.checks.map((check) => check.id)).toEqual(["slow-check", "fast-check"])
  })

  it("maps engine-level failures to internal failure result", async () => {
    // Arrange
    const checks: DoctorCheckDefinition[] = [
      {
        id: "duplicate-id",
        phase: "phase-1",
        tier: "fast",
        run: async () => ({
          severity: "ok",
          summary: "first",
          evidence: [],
        }),
      },
      {
        id: "duplicate-id",
        phase: "phase-2",
        tier: "fast",
        run: async () => ({
          severity: "ok",
          summary: "second",
          evidence: [],
        }),
      },
    ]

    // Act
    const result = await runDoctorEngine({
      mode: "fast",
      checks,
    })

    // Assert
    expect(result.internalFailure).toBe(true)
    expect(result.verdict).toBe("red")
    expect(result.checks).toEqual([])
  })
})
