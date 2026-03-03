import { describe, expect, it } from "vitest"

import { createFastCliSmokeCheck } from "../../src/doctor/checks/fast/cli-smoke.js"
import { createFastConnectivityCheck } from "../../src/doctor/checks/fast/connectivity.js"
import { fastDoctorChecks } from "../../src/doctor/checks/fast/index.js"
import { createFastSystemStatusCheck } from "../../src/doctor/checks/fast/system-status.js"

const testEnvironment = {
  OTTO_EXTERNAL_API_URL: "http://127.0.0.1:4190",
  OTTO_EXTERNAL_API_TOKEN: "secret-token",
}

describe("fast doctor checks", () => {
  it("returns ok for healthy external health probe", async () => {
    // Arrange
    const check = createFastConnectivityCheck({
      environment: testEnvironment,
      fetchImpl: async () => {
        return Response.json({ status: "ok" }, { status: 200 })
      },
    })

    // Act
    const result = await check.run({ mode: "fast" })

    // Assert
    expect(result.severity).toBe("ok")
    expect(result.summary).toContain("healthy")
    expect(result.evidence[0]).toMatchObject({
      code: "EXTERNAL_API_HEALTH_OK",
    })
    expect(result.evidence[0]?.details).toMatchObject({
      endpoint: "/external/health",
      statusCode: 200,
    })
    expect(JSON.stringify(result.evidence)).not.toContain("secret-token")
  })

  it("returns error for external auth failure", async () => {
    // Arrange
    const check = createFastConnectivityCheck({
      environment: testEnvironment,
      fetchImpl: async () => {
        return Response.json({ error: "unauthorized" }, { status: 401 })
      },
    })

    // Act
    const result = await check.run({ mode: "fast" })

    // Assert
    expect(result.severity).toBe("error")
    expect(result.evidence[0]).toMatchObject({
      code: "EXTERNAL_API_AUTH_FAILED",
    })
  })

  it("retries transient connectivity fetch failures before succeeding", async () => {
    // Arrange
    let attempts = 0
    const check = createFastConnectivityCheck({
      environment: testEnvironment,
      fetchImpl: async () => {
        attempts += 1
        if (attempts < 3) {
          throw new Error("fetch failed")
        }

        return Response.json({ status: "ok" }, { status: 200 })
      },
    })

    // Act
    const result = await check.run({ mode: "fast" })

    // Assert
    expect(result.severity).toBe("ok")
    expect(attempts).toBe(3)
  })

  it("returns error when critical services are degraded", async () => {
    // Arrange
    const check = createFastSystemStatusCheck({
      environment: testEnvironment,
      fetchImpl: async () => {
        return Response.json(
          {
            status: "degraded",
            services: [
              {
                id: "runtime",
                label: "Otto Runtime",
                status: "degraded",
                message: "Runtime issues",
              },
              {
                id: "telegram_worker",
                label: "Telegram Worker",
                status: "ok",
                message: "Healthy",
              },
            ],
          },
          { status: 200 }
        )
      },
    })

    // Act
    const result = await check.run({ mode: "fast" })

    // Assert
    expect(result.severity).toBe("error")
    expect(result.evidence[0]).toMatchObject({
      code: "CRITICAL_SERVICE_DEGRADED",
    })
  })

  it("returns warning when a critical service is still starting", async () => {
    // Arrange
    const check = createFastSystemStatusCheck({
      environment: testEnvironment,
      fetchImpl: async () => {
        return Response.json(
          {
            status: "degraded",
            services: [
              {
                id: "scheduler",
                label: "Scheduler",
                status: "degraded",
                message: "Scheduler is starting",
              },
            ],
          },
          { status: 200 }
        )
      },
    })

    // Act
    const result = await check.run({ mode: "fast" })

    // Assert
    expect(result.severity).toBe("warning")
    expect(result.summary).toContain("still starting")
  })

  it("returns warning when only non-critical services are degraded", async () => {
    // Arrange
    const check = createFastSystemStatusCheck({
      environment: testEnvironment,
      fetchImpl: async () => {
        return Response.json(
          {
            status: "degraded",
            services: [
              {
                id: "runtime",
                label: "Otto Runtime",
                status: "ok",
                message: "Healthy",
              },
              {
                id: "telegram_worker",
                label: "Telegram Worker",
                status: "degraded",
                message: "Worker disabled",
              },
            ],
          },
          { status: 200 }
        )
      },
    })

    // Act
    const result = await check.run({ mode: "fast" })

    // Assert
    expect(result.severity).toBe("warning")
    expect(result.evidence[0]).toMatchObject({
      code: "NON_CRITICAL_SERVICE_DEGRADED",
    })
  })

  it("retries transient system-status fetch failures before succeeding", async () => {
    // Arrange
    let attempts = 0
    const check = createFastSystemStatusCheck({
      environment: testEnvironment,
      fetchImpl: async () => {
        attempts += 1
        if (attempts < 3) {
          throw new Error("fetch failed")
        }

        return Response.json(
          {
            status: "ok",
            services: [
              {
                id: "runtime",
                label: "Otto Runtime",
                status: "ok",
                message: "Healthy",
              },
            ],
          },
          { status: 200 }
        )
      },
    })

    // Act
    const result = await check.run({ mode: "fast" })

    // Assert
    expect(result.severity).toBe("ok")
    expect(attempts).toBe(3)
  })

  it("returns ok when all CLI smoke commands pass", async () => {
    // Arrange
    const check = createFastCliSmokeCheck({
      runCommand: async () => ({
        exitCode: 0,
        signal: null,
        durationMs: 1,
      }),
    })

    // Act
    const result = await check.run({ mode: "fast" })

    // Assert
    expect(result.severity).toBe("ok")
    expect(result.evidence.some((entry) => entry.code === "CLI_SMOKE_OK")).toBe(true)
  })

  it("returns error when a CLI smoke command fails", async () => {
    // Arrange
    let runCount = 0
    const check = createFastCliSmokeCheck({
      runCommand: async () => {
        runCount += 1

        if (runCount === 2) {
          return {
            exitCode: 1,
            signal: null,
            durationMs: 1,
          }
        }

        return {
          exitCode: 0,
          signal: null,
          durationMs: 1,
        }
      },
    })

    // Act
    const result = await check.run({ mode: "fast" })

    // Assert
    expect(result.severity).toBe("error")
    expect(result.evidence.some((entry) => entry.code === "CLI_SMOKE_FAILED")).toBe(true)
  })

  it("registers all fast checks", () => {
    const ids = fastDoctorChecks.map((check) => check.id)

    expect(ids).toEqual([
      "fast.external.connectivity",
      "fast.external.system-status",
      "fast.cli.smoke",
    ])
  })
})
