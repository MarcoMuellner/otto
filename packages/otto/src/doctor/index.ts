import type { Logger } from "pino"

import type { DoctorMode } from "../cli/command.js"

export type DoctorVerdict = "green" | "yellow" | "red"

export type DoctorRunSummary = {
  mode: DoctorMode
  verdict: DoctorVerdict
  internalFailure: boolean
}

/**
 * Provides a stable doctor command entrypoint and output contract so CLI routing can be
 * shipped before deeper probe execution logic is implemented.
 *
 * @param logger Command-scoped logger for doctor run telemetry.
 * @param mode Requested doctor execution mode.
 * @returns Structured run summary consumed by the CLI exit-code adapter.
 */
export const runDoctor = async (logger: Logger, mode: DoctorMode): Promise<DoctorRunSummary> => {
  logger.info(
    {
      command: "doctor",
      mode,
    },
    "Doctor run completed"
  )

  return {
    mode,
    verdict: "green",
    internalFailure: false,
  }
}
