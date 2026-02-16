import pino, { type Logger } from "pino"

import { buildLoggerOptions, resolveRuntimeEnv } from "./options.js"

type CreateLoggerInput = {
  env?: "development" | "test" | "production"
  logLevel?: string
  serviceName?: string
}

export const createLogger = (input: CreateLoggerInput = {}): Logger => {
  const env = input.env ?? resolveRuntimeEnv()
  const options = buildLoggerOptions({
    env,
    logLevel: input.logLevel,
    serviceName: input.serviceName,
  })

  return pino(options)
}

export const logger = createLogger()

export const createComponentLogger = (component: string, parent: Logger = logger): Logger => {
  return parent.child({ component })
}
