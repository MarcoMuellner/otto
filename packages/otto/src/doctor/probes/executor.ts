import type { DoctorEvidence, DoctorSeverity } from "../contracts.js"
import type { DoctorProbeDefinition } from "./contracts.js"
import {
  createDoctorCleanupManager,
  type DoctorCleanupManager,
  type DoctorCleanupStep,
} from "./cleanup-manager.js"

type DoctorProbePrecheckResult =
  | {
      ok: true
    }
  | {
      ok: false
      code: string
      reason: string
      details?: Record<string, unknown>
    }

type DoctorProbeExecutionResult = {
  severity: DoctorSeverity
  summary: string
  evidence?: DoctorEvidence[]
}

type DoctorProbePostCleanupVerificationResult =
  | {
      ok: true
      details?: Record<string, unknown>
    }
  | {
      ok: false
      code: string
      reason: string
      details?: Record<string, unknown>
    }

export type DoctorLiveProbeDefinition = DoctorProbeDefinition & {
  integrationId: string
  precheck?: () => Promise<DoctorProbePrecheckResult>
  execute: (context: {
    addCleanupStep: (step: DoctorCleanupStep) => void
  }) => Promise<DoctorProbeExecutionResult>
  postCleanupVerify?: () => Promise<DoctorProbePostCleanupVerificationResult>
}

export type DoctorLiveProbeExecutionResult = {
  probeId: string
  integrationId: string
  severity: DoctorSeverity
  summary: string
  skipped: boolean
  durationMs: number
  evidence: DoctorEvidence[]
}

type ExecuteDoctorLiveProbeDependencies = {
  now?: () => number
  cleanupManagerFactory?: () => DoctorCleanupManager
}

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  return "Unknown probe execution error"
}

/**
 * Runs a live probe lifecycle with deterministic cleanup orchestration so mutating checks can
 * fail safely while still reporting exactly which lifecycle stage broke.
 */
export const executeDoctorLiveProbe = async (
  probe: DoctorLiveProbeDefinition,
  dependencies: ExecuteDoctorLiveProbeDependencies = {}
): Promise<DoctorLiveProbeExecutionResult> => {
  const now = dependencies.now ?? Date.now
  const cleanupManagerFactory = dependencies.cleanupManagerFactory ?? createDoctorCleanupManager

  const startedAt = now()
  const evidence: DoctorEvidence[] = []
  const cleanupManager = cleanupManagerFactory()

  if (probe.precheck) {
    const precheck = await probe.precheck()
    if (!precheck.ok) {
      evidence.push({
        code: precheck.code,
        message: precheck.reason,
        details: precheck.details,
      })

      return {
        probeId: probe.id,
        integrationId: probe.integrationId,
        severity: "warning",
        summary: `Probe '${probe.id}' skipped by precheck`,
        skipped: true,
        durationMs: Math.max(0, now() - startedAt),
        evidence,
      }
    }
  }

  let executionResult: DoctorProbeExecutionResult | null = null
  let executionError: string | null = null

  try {
    executionResult = await probe.execute({
      addCleanupStep: cleanupManager.addStep,
    })
  } catch (error) {
    executionError = toErrorMessage(error)
    evidence.push({
      code: "PROBE_EXECUTION_FAILED",
      message: `Probe '${probe.id}' execution failed`,
      details: {
        probeId: probe.id,
        integrationId: probe.integrationId,
        error: executionError,
      },
    })
  }

  if (executionResult) {
    evidence.push(...(executionResult.evidence ?? []))
  }

  const requiresCleanup = probe.mutating || probe.cleanupRequired || cleanupManager.hasSteps()
  let cleanupFailed = false

  if (requiresCleanup) {
    if (probe.cleanupRequired && !cleanupManager.hasSteps()) {
      cleanupFailed = true
      evidence.push({
        code: "PROBE_CLEANUP_PLAN_MISSING",
        message: `Probe '${probe.id}' requires cleanup but registered no cleanup steps`,
        details: {
          probeId: probe.id,
          integrationId: probe.integrationId,
        },
      })
    } else {
      const cleanup = await cleanupManager.run()
      evidence.push(...cleanup.evidence)
      cleanupFailed = !cleanup.ok
    }
  }

  let postCleanupFailed = false
  if (probe.postCleanupVerify) {
    try {
      const verification = await probe.postCleanupVerify()
      if (!verification.ok) {
        postCleanupFailed = true
        evidence.push({
          code: verification.code,
          message: verification.reason,
          details: verification.details,
        })
      }
    } catch (error) {
      postCleanupFailed = true
      evidence.push({
        code: "PROBE_POST_CLEANUP_VERIFY_FAILED",
        message: `Probe '${probe.id}' post-cleanup verification failed`,
        details: {
          probeId: probe.id,
          integrationId: probe.integrationId,
          error: toErrorMessage(error),
        },
      })
    }
  }

  let severity: DoctorSeverity = executionResult?.severity ?? "error"
  let summary = executionResult?.summary ?? `Probe '${probe.id}' failed`

  if (executionError || cleanupFailed || postCleanupFailed) {
    severity = "error"
    summary = `Probe '${probe.id}' failed`
  }

  return {
    probeId: probe.id,
    integrationId: probe.integrationId,
    severity,
    summary,
    skipped: false,
    durationMs: Math.max(0, now() - startedAt),
    evidence,
  }
}
