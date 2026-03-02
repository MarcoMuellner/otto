import type { DoctorCheckDefinition } from "../../contracts.js"
import { createFastCliSmokeCheck } from "./cli-smoke.js"
import { createFastConnectivityCheck } from "./connectivity.js"
import { createFastSystemStatusCheck } from "./system-status.js"

export const fastDoctorChecks: readonly DoctorCheckDefinition[] = [
  createFastConnectivityCheck(),
  createFastSystemStatusCheck(),
  createFastCliSmokeCheck(),
]
