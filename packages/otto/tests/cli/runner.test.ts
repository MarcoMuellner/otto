import { describe, expect, it, vi } from "vitest"
import type { Logger } from "pino"

import { mapDoctorSummaryToExitCode, runCommand } from "../../src/cli/runner.js"

describe("runCommand", () => {
  it("dispatches to the selected non-doctor command handler", async () => {
    // Arrange
    const logger = {} as Logger
    const setupHandler = vi.fn(async () => {})
    const serveHandler = vi.fn(async () => {})
    const telegramWorkerHandler = vi.fn(async () => {})
    const doctorHandler = vi.fn(async () => ({
      mode: "fast" as const,
      verdict: "green" as const,
      internalFailure: false,
    }))

    // Act
    const exitCode = await runCommand({ name: "setup" }, logger, {
      setup: setupHandler,
      serve: serveHandler,
      "telegram-worker": telegramWorkerHandler,
      doctor: doctorHandler,
    })

    // Assert
    expect(setupHandler).toHaveBeenCalledOnce()
    expect(serveHandler).not.toHaveBeenCalled()
    expect(telegramWorkerHandler).not.toHaveBeenCalled()
    expect(doctorHandler).not.toHaveBeenCalled()
    expect(exitCode).toBe(0)
  })

  it("dispatches doctor command and maps verdict to exit code", async () => {
    // Arrange
    const logger = {} as Logger
    const setupHandler = vi.fn(async () => {})
    const serveHandler = vi.fn(async () => {})
    const telegramWorkerHandler = vi.fn(async () => {})
    const doctorHandler = vi.fn(async () => ({
      mode: "deep" as const,
      verdict: "yellow" as const,
      internalFailure: false,
    }))

    // Act
    const exitCode = await runCommand(
      {
        name: "doctor",
        mode: "deep",
      },
      logger,
      {
        setup: setupHandler,
        serve: serveHandler,
        "telegram-worker": telegramWorkerHandler,
        doctor: doctorHandler,
      }
    )

    // Assert
    expect(doctorHandler).toHaveBeenCalledWith(logger, "deep")
    expect(setupHandler).not.toHaveBeenCalled()
    expect(serveHandler).not.toHaveBeenCalled()
    expect(telegramWorkerHandler).not.toHaveBeenCalled()
    expect(exitCode).toBe(1)
  })
})

describe("mapDoctorSummaryToExitCode", () => {
  it("returns 0 for green verdict", () => {
    expect(
      mapDoctorSummaryToExitCode({
        mode: "fast",
        verdict: "green",
        internalFailure: false,
      })
    ).toBe(0)
  })

  it("returns 1 for yellow verdict", () => {
    expect(
      mapDoctorSummaryToExitCode({
        mode: "fast",
        verdict: "yellow",
        internalFailure: false,
      })
    ).toBe(1)
  })

  it("returns 1 for red verdict", () => {
    expect(
      mapDoctorSummaryToExitCode({
        mode: "deep",
        verdict: "red",
        internalFailure: false,
      })
    ).toBe(1)
  })

  it("returns 2 for internal failures", () => {
    expect(
      mapDoctorSummaryToExitCode({
        mode: "deep",
        verdict: "green",
        internalFailure: true,
      })
    ).toBe(2)
  })
})
