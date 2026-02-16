import pino, { type Logger } from "pino"

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
  const options = buildLoggerOptions({
    env,
    logLevel: input.logLevel,
    serviceName: input.serviceName,
    prettyLogs,
  })

  return pino(options)
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
