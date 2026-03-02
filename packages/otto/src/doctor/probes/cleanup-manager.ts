import type { DoctorEvidence } from "../contracts.js"

export type DoctorCleanupStep = {
  id: string
  run: () => Promise<void>
  verify?: () => Promise<void>
}

export type DoctorCleanupStepResult = {
  id: string
  ok: boolean
  stage: "run" | "verify"
  error: string | null
}

export type DoctorCleanupManagerResult = {
  ok: boolean
  steps: DoctorCleanupStepResult[]
  evidence: DoctorEvidence[]
}

export type DoctorCleanupManager = {
  addStep: (step: DoctorCleanupStep) => void
  hasSteps: () => boolean
  run: () => Promise<DoctorCleanupManagerResult>
}

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  return "Unknown cleanup error"
}

/**
 * Coordinates deterministic probe cleanup in reverse registration order so mutating deep probes
 * can roll back side effects predictably and report exactly where cleanup failed.
 */
export const createDoctorCleanupManager = (): DoctorCleanupManager => {
  const steps: DoctorCleanupStep[] = []

  return {
    addStep: (step): void => {
      steps.push(step)
    },
    hasSteps: (): boolean => {
      return steps.length > 0
    },
    run: async (): Promise<DoctorCleanupManagerResult> => {
      const ordered = [...steps].reverse()
      const results: DoctorCleanupStepResult[] = []
      const evidence: DoctorEvidence[] = []

      for (const step of ordered) {
        try {
          await step.run()
          results.push({
            id: step.id,
            ok: true,
            stage: "run",
            error: null,
          })
          evidence.push({
            code: "PROBE_CLEANUP_STEP_RUN_OK",
            message: `Cleanup step '${step.id}' completed`,
            details: {
              stepId: step.id,
            },
          })
        } catch (error) {
          const reason = toErrorMessage(error)
          results.push({
            id: step.id,
            ok: false,
            stage: "run",
            error: reason,
          })
          evidence.push({
            code: "PROBE_CLEANUP_STEP_RUN_FAILED",
            message: `Cleanup step '${step.id}' failed`,
            details: {
              stepId: step.id,
              error: reason,
            },
          })
          continue
        }

        if (!step.verify) {
          continue
        }

        try {
          await step.verify()
          results.push({
            id: step.id,
            ok: true,
            stage: "verify",
            error: null,
          })
          evidence.push({
            code: "PROBE_CLEANUP_STEP_VERIFY_OK",
            message: `Cleanup verification for '${step.id}' completed`,
            details: {
              stepId: step.id,
            },
          })
        } catch (error) {
          const reason = toErrorMessage(error)
          results.push({
            id: step.id,
            ok: false,
            stage: "verify",
            error: reason,
          })
          evidence.push({
            code: "PROBE_CLEANUP_STEP_VERIFY_FAILED",
            message: `Cleanup verification for '${step.id}' failed`,
            details: {
              stepId: step.id,
              error: reason,
            },
          })
        }
      }

      return {
        ok: results.every((entry) => entry.ok),
        steps: results,
        evidence,
      }
    },
  }
}
