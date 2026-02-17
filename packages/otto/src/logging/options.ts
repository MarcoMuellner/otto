import pino, { type LoggerOptions, type TransportSingleOptions } from "pino"

export type RuntimeEnv = "development" | "test" | "production"

type BuildLoggerOptionsInput = {
  env?: RuntimeEnv
  logLevel?: string
  serviceName?: string
  prettyLogs?: boolean
}

const PRETTY_TRANSPORT: TransportSingleOptions = {
  target: "pino-pretty",
  options: {
    colorize: true,
    singleLine: true,
    translateTime: "SYS:standard",
    ignore: "pid,hostname",
  },
}

/**
 * Normalizes runtime environment values so logger behavior is explicit and stable even
 * when NODE_ENV is unset or loosely configured.
 *
 * @param value Optional environment value, defaulting to NODE_ENV.
 * @returns Runtime environment category used by logger policy.
 */
export const resolveRuntimeEnv = (value = process.env.NODE_ENV): RuntimeEnv => {
  if (value === "production") {
    return "production"
  }

  if (value === "test") {
    return "test"
  }

  return "development"
}

/**
 * Centralizes logger option policy so human-friendly development logs and production
 * structured logs are configured consistently across all Otto processes.
 *
 * @param input Optional logger overrides for env, level, and service naming.
 * @returns Pino logger options tuned for Otto defaults.
 */
export const buildLoggerOptions = ({
  env = resolveRuntimeEnv(),
  logLevel,
  serviceName = "otto",
  prettyLogs = false,
}: BuildLoggerOptionsInput = {}): LoggerOptions => {
  const level = logLevel ?? (env === "development" ? "debug" : "info")
  const shouldUsePrettyTransport = env === "development" && prettyLogs

  return {
    name: serviceName,
    level,
    base: {
      service: serviceName,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    transport: shouldUsePrettyTransport ? PRETTY_TRANSPORT : undefined,
  }
}
