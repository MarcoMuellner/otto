import { mkdir, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import type { DoctorMode } from "../../cli/command.js"
import type { DoctorVerdict } from "../contracts.js"

type WriteDoctorIncidentInput = {
  content: string
  mode: DoctorMode
  verdict: DoctorVerdict
  environment?: NodeJS.ProcessEnv
  now?: Date
}

const resolveOttoHome = (environment: NodeJS.ProcessEnv): string => {
  return environment.OTTO_HOME ?? path.join(os.homedir(), ".otto")
}

const formatFileTimestamp = (value: Date): string => {
  const year = value.getUTCFullYear()
  const month = String(value.getUTCMonth() + 1).padStart(2, "0")
  const day = String(value.getUTCDate()).padStart(2, "0")
  const hour = String(value.getUTCHours()).padStart(2, "0")
  const minute = String(value.getUTCMinutes()).padStart(2, "0")
  const second = String(value.getUTCSeconds()).padStart(2, "0")
  const millis = String(value.getUTCMilliseconds()).padStart(3, "0")
  return `${year}${month}${day}-${hour}${minute}${second}-${millis}`
}

/**
 * Persists one local incident markdown artifact for non-green doctor runs so each failure
 * has a stable, shareable diagnostic file with deterministic naming.
 */
export const writeDoctorIncidentReport = async (
  input: WriteDoctorIncidentInput
): Promise<string> => {
  const environment = input.environment ?? process.env
  const now = input.now ?? new Date()
  const ottoHome = resolveOttoHome(environment)
  const incidentsDirectory = path.join(ottoHome, "logs", "doctor", "incidents")

  await mkdir(incidentsDirectory, { recursive: true })

  const fileName = `doctor-incident-${formatFileTimestamp(now)}-${input.mode}-${input.verdict}.md`
  const filePath = path.join(incidentsDirectory, fileName)

  await writeFile(filePath, input.content, "utf8")
  return filePath
}
