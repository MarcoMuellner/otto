import type { DoctorExternalApiClient, DoctorExternalJobRecord } from "../adapters/external-api.js"

export type DoctorJobCleanupResult =
  | {
      ok: true
      mutationStatus:
        | "deleted"
        | "cancelled"
        | "already_terminal"
        | "already_cancelled"
        | "not_found"
      verification: {
        hasResidual: false
      }
    }
  | {
      ok: false
      mutationStatus: "mutation_failed" | "verification_failed"
      reasonCode:
        | "EXTERNAL_API_DELETE_FAILED"
        | "EXTERNAL_API_CANCEL_FAILED"
        | "DOCTOR_JOB_RESIDUAL_RUNNING"
        | "DOCTOR_JOB_RESIDUAL_SCHEDULED"
        | "DOCTOR_JOB_RESIDUAL_TERMINAL_MISSING"
      reason: string
      verification?: {
        hasResidual: boolean
        job: DoctorExternalJobRecord | null
      }
    }

export const verifyNoResidualDoctorJobArtifact = async (
  apiClient: DoctorExternalApiClient,
  jobId: string
): Promise<
  | {
      ok: true
      hasResidual: false
      job: DoctorExternalJobRecord | null
    }
  | {
      ok: false
      hasResidual: true
      reasonCode:
        | "DOCTOR_JOB_RESIDUAL_RUNNING"
        | "DOCTOR_JOB_RESIDUAL_SCHEDULED"
        | "DOCTOR_JOB_RESIDUAL_TERMINAL_MISSING"
      reason: string
      job: DoctorExternalJobRecord
    }
> => {
  const job = await apiClient.getJob(jobId)
  if (!job) {
    return {
      ok: true,
      hasResidual: false,
      job: null,
    }
  }

  if (job.status === "running") {
    return {
      ok: false,
      hasResidual: true,
      reasonCode: "DOCTOR_JOB_RESIDUAL_RUNNING",
      reason: "Probe job is still running after cleanup",
      job,
    }
  }

  if (job.nextRunAt !== null) {
    return {
      ok: false,
      hasResidual: true,
      reasonCode: "DOCTOR_JOB_RESIDUAL_SCHEDULED",
      reason: "Probe job still has a pending schedule after cleanup",
      job,
    }
  }

  if (job.terminalState === null) {
    return {
      ok: false,
      hasResidual: true,
      reasonCode: "DOCTOR_JOB_RESIDUAL_TERMINAL_MISSING",
      reason: "Probe job is unscheduled but not terminal after cleanup",
      job,
    }
  }

  return {
    ok: true,
    hasResidual: false,
    job,
  }
}

export const cleanupDoctorJobArtifact = async (
  apiClient: DoctorExternalApiClient,
  jobId: string
): Promise<DoctorJobCleanupResult> => {
  let mutationStatus:
    | "deleted"
    | "cancelled"
    | "already_terminal"
    | "already_cancelled"
    | "not_found"

  try {
    const deleted = await apiClient.deleteJob(jobId, "doctor deep probe cleanup")
    mutationStatus = deleted?.status === "deleted" ? "deleted" : "not_found"
  } catch (error) {
    const err = error as Error

    try {
      const cancelled = await apiClient.cancelBackgroundJob(jobId, "doctor deep probe cleanup")
      mutationStatus = cancelled?.outcome ?? "not_found"
    } catch (cancelError) {
      const cancelErr = cancelError as Error
      return {
        ok: false,
        mutationStatus: "mutation_failed",
        reasonCode: "EXTERNAL_API_CANCEL_FAILED",
        reason: `${err.message}; fallback cancel failed: ${cancelErr.message}`,
      }
    }
  }

  const verification = await verifyNoResidualDoctorJobArtifact(apiClient, jobId)
  if (!verification.ok) {
    return {
      ok: false,
      mutationStatus: "verification_failed",
      reasonCode: verification.reasonCode,
      reason: verification.reason,
      verification: {
        hasResidual: verification.hasResidual,
        job: verification.job,
      },
    }
  }

  return {
    ok: true,
    mutationStatus,
    verification: {
      hasResidual: false,
    },
  }
}
