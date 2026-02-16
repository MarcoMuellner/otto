import { describe, expect, it } from "vitest"

import { buildLoggerOptions, resolveRuntimeEnv } from "../../src/logging/options.js"

describe("resolveRuntimeEnv", () => {
  it("defaults to development when env value is empty", () => {
    expect(resolveRuntimeEnv("")).toBe("development")
  })

  it("returns production for production", () => {
    expect(resolveRuntimeEnv("production")).toBe("production")
  })

  it("returns test for test", () => {
    expect(resolveRuntimeEnv("test")).toBe("test")
  })

  it("falls back to development for unknown values", () => {
    expect(resolveRuntimeEnv("staging")).toBe("development")
  })
})

describe("buildLoggerOptions", () => {
  it("enables pretty logging in development", () => {
    const options = buildLoggerOptions({ env: "development" })

    expect(options.level).toBe("debug")
    expect(options.transport).toEqual({
      target: "pino-pretty",
      options: {
        colorize: true,
        singleLine: true,
        translateTime: "SYS:standard",
        ignore: "pid,hostname",
      },
    })
  })

  it("disables pretty transport in production", () => {
    const options = buildLoggerOptions({ env: "production" })

    expect(options.level).toBe("info")
    expect(options.transport).toBeUndefined()
  })

  it("uses explicit log level overrides", () => {
    const options = buildLoggerOptions({ env: "production", logLevel: "warn" })

    expect(options.level).toBe("warn")
  })
})
