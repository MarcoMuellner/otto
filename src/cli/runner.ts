import type { Logger } from "pino"

import type { OttoCommand } from "./command.js"

type CommandHandler = (logger: Logger) => Promise<unknown>

type CommandHandlers = Record<OttoCommand, CommandHandler>

export const runCommand = async (
  command: OttoCommand,
  logger: Logger,
  handlers: CommandHandlers
): Promise<void> => {
  await handlers[command](logger)
}
