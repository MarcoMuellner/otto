import type { DoctorCheckDefinition } from "../../contracts.js"
import { createDeepExtensionRequirementsCheck } from "./extension-requirements.js"

export const deepDoctorChecks: readonly DoctorCheckDefinition[] = [
  createDeepExtensionRequirementsCheck(),
]
