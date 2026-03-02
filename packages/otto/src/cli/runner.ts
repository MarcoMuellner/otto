import type { Logger } from "pino"

import type { DoctorMode, OttoCommand } from "./command.js"
import type { DoctorRunSummary } from "../doctor/index.js"

type CommandHandler = (logger: Logger) => Promise<unknown>
type DoctorCommandHandler = (logger: Logger, mode: DoctorMode) => Promise<DoctorRunSummary>

type CommandHandlers = {
  setup: CommandHandler
  serve: CommandHandler
  "telegram-worker": CommandHandler
  doctor: DoctorCommandHandler
}

export const mapDoctorSummaryToExitCode = (summary: DoctorRunSummary): number => {
  if (summary.internalFailure) {
    return 2
  }

  if (summary.verdict === "green") {
    return 0
  }

  return 1
}

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
): Promise<number> => {
  if (command.name === "doctor") {
    const summary = await handlers.doctor(logger, command.mode)
    return mapDoctorSummaryToExitCode(summary)
  }

  await handlers[command.name](logger)
  return 0
}
