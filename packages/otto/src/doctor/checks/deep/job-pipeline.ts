import { randomUUID } from "node:crypto"

import { INTERACTIVE_BACKGROUND_ONESHOT_JOB_TYPE } from "../../../api-services/interactive-background-jobs.js"
import {
  createDoctorExternalApiClient,
  type DoctorExternalApiClient,
  type DoctorExternalJobRunRecord,
} from "../../adapters/external-api.js"
import type { DoctorCheckDefinition, DoctorCheckOutput } from "../../contracts.js"
import { cleanupDoctorJobArtifact } from "../../probes/cleanup.js"
import { evaluateDoctorProbeGate } from "../../probes/registry.js"
import type { DoctorProbeDefinition } from "../../probes/contracts.js"

type DeepJobPipelineDependencies = {
  now?: () => number
  sleep?: (ms: number) => Promise<void>
  environment?: NodeJS.ProcessEnv
  apiClient?: DoctorExternalApiClient
  pollIntervalMs?: number
  pollTimeoutMs?: number
  probeDefinition?: DoctorProbeDefinition
}

type WaitForRunCompletionResult = {
  run: DoctorExternalJobRunRecord | null
  runId: string | null
  pollCount: number
  observedStates: string[]
}

const POLL_INTERVAL_MS = 500
const POLL_TIMEOUT_MS = 30_000

const defaultProbeDefinition: DoctorProbeDefinition = {
  id: "probe.job-pipeline.mutating",
  mutating: true,
  cleanupRequired: true,
  cleanupGuaranteed: true,
  lockKey: "integration:job-pipeline",
}

const sleepWithTimer = async (durationMs: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, durationMs))
}

const buildDoctorJobId = (now: number): string => {
  return `doctor.job-pipeline.${now}.${randomUUID().slice(0, 8)}`
}

const waitForRunCompletion = async (
  apiClient: DoctorExternalApiClient,
  jobId: string,
  now: () => number,
  sleep: (ms: number) => Promise<void>,
  pollIntervalMs: number,
  timeoutMs: number
): Promise<WaitForRunCompletionResult> => {
  const startedAt = now()
  const observedStates: string[] = []
  let runId: string | null = null
  let pollCount = 0

  while (now() - startedAt <= timeoutMs) {
    pollCount += 1
    const runs = await apiClient.listJobRuns({
      jobId,
      limit: 5,
      offset: 0,
    })
    const latestRun = runs.runs[0] ?? null

    if (latestRun) {
      runId = latestRun.id
      const phaseState =
        latestRun.finishedAt === null ? `${latestRun.status}:active` : latestRun.status
      if (!observedStates.includes(phaseState)) {
        observedStates.push(phaseState)
      }

      if (latestRun.finishedAt !== null) {
        return {
          run: latestRun,
          runId,
          pollCount,
          observedStates,
        }
      }
    }

    await sleep(pollIntervalMs)
  }

  return {
    run: null,
    runId,
    pollCount,
    observedStates,
  }
}

/**
 * Executes a controlled deep mutating probe against the job pipeline so runtime operators can
 * verify create/run/cleanup behavior with durable evidence and explicit cleanup guarantees.
 */
export const createDeepJobPipelineCheck = (
  dependencies: DeepJobPipelineDependencies = {}
): DoctorCheckDefinition => {
  const now = dependencies.now ?? Date.now
  const sleep = dependencies.sleep ?? sleepWithTimer
  const environment = dependencies.environment ?? process.env
  const pollIntervalMs = dependencies.pollIntervalMs ?? POLL_INTERVAL_MS
  const pollTimeoutMs = dependencies.pollTimeoutMs ?? POLL_TIMEOUT_MS
  const probeDefinition = dependencies.probeDefinition ?? defaultProbeDefinition

  return {
    id: "deep.job.pipeline",
    phase: "deep.runtime",
    tier: "deep",
    lockKey: probeDefinition.lockKey,
    timeoutMs: 40_000,
    run: async (): Promise<DoctorCheckOutput> => {
      const evidence: DoctorCheckOutput["evidence"] = []
      const gateDecision = evaluateDoctorProbeGate(probeDefinition)
      if (!gateDecision.allowed) {
        return {
          severity: "warning",
          summary: "Job pipeline probe skipped by cleanup safety gate",
          evidence: [
            {
              code: gateDecision.skipReason.code,
              message: gateDecision.skipReason.message,
              details: gateDecision.skipReason.details,
            },
          ],
        }
      }

      const apiClient =
        dependencies.apiClient ??
        (await createDoctorExternalApiClient({
          environment,
        }))

      const checkStartedAt = now()
      const probeJobId = buildDoctorJobId(checkStartedAt)
      let createdJobId: string | null = null
      let observedRunId: string | null = null
      let runSeverity: "ok" | "error" = "ok"
      let createAttempted = false

      try {
        createAttempted = true
        const createResult = await apiClient.createJob({
          id: probeJobId,
          type: INTERACTIVE_BACKGROUND_ONESHOT_JOB_TYPE,
          scheduleType: "oneshot",
          runAt: now(),
          payload: {
            version: 0,
            doctorProbe: true,
          },
        })

        createdJobId = createResult.id
        evidence.push({
          code: "DEEP_JOB_PROBE_CREATED",
          message: "Created temporary doctor probe job",
          details: {
            jobId: createResult.id,
            mutationStatus: createResult.status,
          },
        })

        const runNowResult = await apiClient.runJobNow(createdJobId)
        evidence.push({
          code: "DEEP_JOB_PROBE_TRIGGERED",
          message: "Triggered immediate run for temporary doctor probe job",
          details: {
            jobId: createdJobId,
            mutationStatus: runNowResult.status,
            scheduledFor: runNowResult.scheduledFor ?? null,
          },
        })

        const completedRun = await waitForRunCompletion(
          apiClient,
          createdJobId,
          now,
          sleep,
          pollIntervalMs,
          pollTimeoutMs
        )

        observedRunId = completedRun.runId
        if (!completedRun.run) {
          runSeverity = "error"
          evidence.push({
            code: "DEEP_JOB_PROBE_RUN_TIMEOUT",
            message: `Timed out waiting for probe run completion after ${pollTimeoutMs}ms`,
            details: {
              jobId: createdJobId,
              runId: completedRun.runId,
              pollCount: completedRun.pollCount,
              observedStates: completedRun.observedStates,
            },
          })
        } else {
          const finishedAt = completedRun.run.finishedAt ?? completedRun.run.startedAt
          const durationMs = Math.max(0, finishedAt - completedRun.run.startedAt)
          evidence.push({
            code: "DEEP_JOB_PROBE_RUN_COMPLETED",
            message: "Probe run completed with terminal result",
            details: {
              jobId: createdJobId,
              runId: completedRun.run.id,
              status: completedRun.run.status,
              startedAt: completedRun.run.startedAt,
              finishedAt,
              durationMs,
              pollCount: completedRun.pollCount,
              observedStates: completedRun.observedStates,
            },
          })
        }
      } catch (error) {
        runSeverity = "error"
        const err = error as Error
        evidence.push({
          code: "DEEP_JOB_PROBE_EXECUTION_FAILED",
          message: "Job pipeline probe failed before run completion",
          details: {
            jobId: createdJobId ?? probeJobId,
            runId: observedRunId,
            error: err.message,
          },
        })
      }

      if (createAttempted) {
        const cleanupJobId = createdJobId ?? probeJobId
        const cleanup = await cleanupDoctorJobArtifact(apiClient, cleanupJobId)
        if (!cleanup.ok) {
          evidence.push({
            code: cleanup.reasonCode,
            message: "Failed to clean up doctor probe artifact",
            details: {
              jobId: cleanupJobId,
              mutationStatus: cleanup.mutationStatus,
              reason: cleanup.reason,
              verification: cleanup.verification,
            },
          })

          return {
            severity: "error",
            summary:
              runSeverity === "ok"
                ? "Job pipeline probe cleanup failed"
                : "Job pipeline probe failed",
            evidence,
          }
        }

        evidence.push({
          code: "DEEP_JOB_PROBE_CLEANUP_OK",
          message: "Doctor probe artifact cleanup verified",
          details: {
            jobId: cleanupJobId,
            mutationStatus: cleanup.mutationStatus,
            hasResidual: cleanup.verification.hasResidual,
          },
        })
      }

      const totalDurationMs = Math.max(0, now() - checkStartedAt)

      if (runSeverity === "error") {
        return {
          severity: "error",
          summary: "Job pipeline probe failed",
          evidence: [
            ...evidence,
            {
              code: "DEEP_JOB_PROBE_FAILED",
              message: "Job pipeline probe did not complete successfully",
              details: {
                durationMs: totalDurationMs,
              },
            },
          ],
        }
      }

      return {
        severity: "ok",
        summary: "Job pipeline probe completed and cleanup verified",
        evidence: [
          ...evidence,
          {
            code: "DEEP_JOB_PROBE_OK",
            message: "Create/run/cleanup path completed for doctor probe job",
            details: {
              jobId: createdJobId,
              runId: observedRunId,
              durationMs: totalDurationMs,
            },
          },
        ],
      }
    },
  }
}
