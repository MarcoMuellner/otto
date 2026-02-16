import pino, { type LoggerOptions, type TransportSingleOptions } from "pino"

export type RuntimeEnv = "development" | "test" | "production"

type BuildLoggerOptionsInput = {
  env?: RuntimeEnv
  logLevel?: string
  serviceName?: string
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

export const resolveRuntimeEnv = (value = process.env.NODE_ENV): RuntimeEnv => {
  if (value === "production") {
    return "production"
  }

  if (value === "test") {
    return "test"
  }

  return "development"
}

export const buildLoggerOptions = ({
  env = resolveRuntimeEnv(),
  logLevel,
  serviceName = "otto",
}: BuildLoggerOptionsInput = {}): LoggerOptions => {
  const level = logLevel ?? (env === "development" ? "debug" : "info")

  return {
    name: serviceName,
    level,
    base: {
      service: serviceName,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    transport: env === "development" ? PRETTY_TRANSPORT : undefined,
  }
}
