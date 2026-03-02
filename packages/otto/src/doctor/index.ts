import type { Logger } from "pino"

import type { DoctorMode } from "../cli/command.js"
import { deepDoctorChecks } from "./checks/deep/index.js"
import { fastDoctorChecks } from "./checks/fast/index.js"
import { runDoctorEngine } from "./engine.js"
import type { DoctorCheckDefinition, DoctorVerdict } from "./contracts.js"

const doctorChecks: DoctorCheckDefinition[] = [...fastDoctorChecks, ...deepDoctorChecks]

export type DoctorRunSummary = {
  mode: DoctorMode
  verdict: DoctorVerdict
  internalFailure: boolean
}

/**
 * Adapts detailed doctor engine output to the stable CLI summary contract so command routing
 * and exit-code behavior remain backward-compatible as checks evolve.
 *
 * @param logger Command-scoped logger for doctor run telemetry.
 * @param mode Requested doctor execution mode.
 * @returns Structured run summary consumed by the CLI exit-code adapter.
 */
export const runDoctor = async (logger: Logger, mode: DoctorMode): Promise<DoctorRunSummary> => {
  const result = await runDoctorEngine({
    mode,
    checks: doctorChecks,
  })

  logger.info(
    {
      command: "doctor",
      mode,
      verdict: result.verdict,
      internalFailure: result.internalFailure,
      checks: result.checks.length,
    },
    "Doctor run completed"
  )

  return {
    mode: result.mode,
    verdict: result.verdict,
    internalFailure: result.internalFailure,
  }
}
