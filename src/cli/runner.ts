import type { Logger } from "pino"

import type { OttoCommand } from "./command.js"

type CommandHandler = (logger: Logger) => Promise<unknown>

type CommandHandlers = Record<OttoCommand, CommandHandler>

/**
 * Isolates command dispatch from process bootstrapping so each runtime mode can evolve
 * independently without rewriting startup control flow.
 *
 * @param command Parsed command to execute.
 * @param logger Component-scoped logger for command telemetry.
 * @param handlers Command-to-handler mapping supplied by the runtime entrypoint.
 */
export const runCommand = async (
  command: OttoCommand,
  logger: Logger,
  handlers: CommandHandlers
): Promise<void> => {
  await handlers[command](logger)
}
