import type { Logger } from "pino"

import type { DoctorMode } from "../cli/command.js"
import { deepDoctorChecks } from "./checks/deep/index.js"
import { fastDoctorChecks } from "./checks/fast/index.js"
import { runDoctorEngine } from "./engine.js"
import { redactDoctorRunResult } from "./redaction.js"
import { renderDoctorTerminalOutput } from "./render/terminal.js"
import { buildDoctorIncidentMarkdown } from "./report/incident-markdown.js"
import { writeDoctorIncidentReport } from "./report/write-incident.js"
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

  const redactedResult = redactDoctorRunResult(result)

  let incidentPath: string | null = null
  let incidentWriteError: string | null = null
  let internalFailure = redactedResult.internalFailure

  if (redactedResult.verdict !== "green") {
    try {
      const incidentMarkdown = buildDoctorIncidentMarkdown(redactedResult)
      incidentPath = await writeDoctorIncidentReport({
        content: incidentMarkdown,
        mode: redactedResult.mode,
        verdict: redactedResult.verdict,
      })
    } catch (error) {
      const err = error as Error
      incidentWriteError = err.message
      internalFailure = true
    }
  }

  const outputResult = {
    ...redactedResult,
    internalFailure,
  }

  process.stdout.write(
    `${renderDoctorTerminalOutput({
      result: outputResult,
      incidentPath,
      incidentWriteError,
    })}\n`
  )

  logger.info(
    {
      command: "doctor",
      mode,
      verdict: redactedResult.verdict,
      internalFailure,
      checks: redactedResult.checks.length,
      incidentPath,
      incidentWriteError,
    },
    "Doctor run completed"
  )

  return {
    mode: redactedResult.mode,
    verdict: redactedResult.verdict,
    internalFailure,
  }
}
