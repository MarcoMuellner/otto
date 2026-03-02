import type { DoctorCheckDefinition } from "../../contracts.js"
import { createDeepExtensionRequirementsCheck } from "./extension-requirements.js"
import { createDeepJobPipelineCheck } from "./job-pipeline.js"

export const deepDoctorChecks: readonly DoctorCheckDefinition[] = [
  createDeepExtensionRequirementsCheck(),
  createDeepJobPipelineCheck(),
]
