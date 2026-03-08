import path from "node:path"

import pino, { type Logger } from "pino"

import { createDailyRotatingLogStream } from "./daily-log-stream.js"
import { buildLoggerOptions, resolveRuntimeEnv } from "./options.js"

type CreateLoggerInput = {
  env?: "development" | "test" | "production"
  logLevel?: string
  serviceName?: string
  prettyLogs?: boolean
}

/**
 * Creates logger instances from one shared policy surface so all runtime components emit
 * consistent metadata and formatting.
 *
 * @param input Optional logger overrides for embedding and tests.
 * @returns Configured Pino logger.
 */
export const createLogger = (input: CreateLoggerInput = {}): Logger => {
  const env = input.env ?? resolveRuntimeEnv()
  const prettyLogs = input.prettyLogs ?? process.env.OTTO_PRETTY_LOGS === "1"
  const envLogLevel = process.env.OTTO_LOG_LEVEL?.trim()
  const options = buildLoggerOptions({
    env,
    logLevel: input.logLevel ?? (envLogLevel && envLogLevel.length > 0 ? envLogLevel : undefined),
    serviceName: input.serviceName,
    prettyLogs,
  })

  if (env === "test" || prettyLogs) {
    return pino(options)
  }

  const fileLoggingEnabled = process.env.OTTO_LOG_FILE_ENABLED?.trim() !== "0"
  if (!fileLoggingEnabled) {
    return pino(options)
  }

  const retentionDaysRaw = process.env.OTTO_LOG_RETENTION_DAYS?.trim()
  const retentionDays = retentionDaysRaw ? Number.parseInt(retentionDaysRaw, 10) : 30
  const effectiveRetentionDays =
    Number.isFinite(retentionDays) && retentionDays > 0 ? retentionDays : 30

  const configuredLogDir = process.env.OTTO_LOG_DIRECTORY?.trim()
  const ottoHome = process.env.OTTO_HOME?.trim()
  const home = process.env.HOME?.trim()
  const fallbackDirectory =
    ottoHome && ottoHome.length > 0
      ? path.join(ottoHome, "logs")
      : home && home.length > 0
        ? path.join(home, ".otto", "logs")
        : null
  const logDirectory =
    configuredLogDir && configuredLogDir.length > 0
      ? path.resolve(configuredLogDir)
      : fallbackDirectory

  if (!logDirectory) {
    return pino(options)
  }

  const rotatingFileStream = createDailyRotatingLogStream({
    directory: logDirectory,
    retentionDays: effectiveRetentionDays,
  })

  return pino(
    options,
    pino.multistream([{ stream: process.stdout }, { stream: rotatingFileStream }])
  )
}

export const logger = createLogger()

/**
 * Uses child loggers to preserve component context in every line, which keeps multi-process
 * runtime traces readable during setup, serving, and background automation.
 *
 * @param component Logical component name attached to each record.
 * @param parent Parent logger used to inherit base runtime fields.
 * @returns Component-scoped logger.
 */
export const createComponentLogger = (component: string, parent: Logger = logger): Logger => {
  return parent.child({ component })
}
