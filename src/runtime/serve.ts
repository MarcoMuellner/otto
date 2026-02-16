import path from "node:path"
import { access } from "node:fs/promises"
import { constants } from "node:fs"

import type { Logger } from "pino"

import { ensureOttoConfigFile } from "../config/otto-config.js"
import { startOpencodeServer } from "../opencode/server.js"

/**
 * Keeps process lifetime tied to OS signals so the server can shut down cleanly in local
 * terminals, supervisors, and containerized runtimes.
 *
 * @returns First shutdown signal received by the process.
 */
const waitForShutdownSignal = async (): Promise<NodeJS.Signals> => {
  return await new Promise((resolve) => {
    const onSignal = (signal: NodeJS.Signals): void => {
      process.off("SIGINT", onSignal)
      process.off("SIGTERM", onSignal)
      resolve(signal)
    }

    process.on("SIGINT", onSignal)
    process.on("SIGTERM", onSignal)
  })
}

/**
 * Runs Otto in serve mode without mutating installation state, which preserves a clean
 * boundary between setup-time deployment and runtime execution.
 *
 * @param logger Command-scoped logger for runtime telemetry.
 * @param homeDirectory Optional home override used by tests and embedding.
 */
export const runServe = async (logger: Logger, homeDirectory?: string): Promise<void> => {
  const { config, configPath, created } = await ensureOttoConfigFile(homeDirectory)

  if (created) {
    logger.info({ configPath }, "Created default Otto config file")
  }

  const opencodeConfigPath = path.join(config.ottoHome, "opencode.jsonc")
  const agentsPath = path.join(config.ottoHome, "AGENTS.md")

  await access(opencodeConfigPath, constants.F_OK).catch(() => {
    throw new Error(`OpenCode config not found at ${opencodeConfigPath}. Run "otto setup" first.`)
  })

  await access(agentsPath, constants.F_OK).catch(() => {
    throw new Error(`AGENTS file not found at ${agentsPath}. Run "otto setup" first.`)
  })

  process.chdir(config.ottoHome)

  const server = await startOpencodeServer({
    hostname: config.opencode.hostname,
    port: config.opencode.port,
    configPath: opencodeConfigPath,
  })

  logger.info(
    {
      command: "serve",
      configPath,
      opencodeConfigPath,
      ottoHome: config.ottoHome,
      hostname: config.opencode.hostname,
      port: config.opencode.port,
      url: server.url,
    },
    "OpenCode server started"
  )

  const signal = await waitForShutdownSignal()

  logger.info({ signal }, "Shutdown signal received")

  server.close()

  logger.info("OpenCode server stopped")
}
