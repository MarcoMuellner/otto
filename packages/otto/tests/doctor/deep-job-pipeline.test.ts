import { describe, expect, it } from "vitest"

import type {
  DoctorExternalApiClient,
  DoctorExternalJobRecord,
  DoctorExternalJobRunRecord,
  DoctorExternalTaskMutationResult,
} from "../../src/doctor/adapters/external-api.js"
import { createDeepJobPipelineCheck } from "../../src/doctor/checks/deep/job-pipeline.js"

const createTaskMutationResult = (
  id: string,
  status: DoctorExternalTaskMutationResult["status"]
): DoctorExternalTaskMutationResult => {
  return {
    id,
    status,
  }
}

const createJobRecord = (id: string, overrides: Partial<DoctorExternalJobRecord> = {}) => {
  return {
    id,
    type: "interactive_background_oneshot",
    status: "idle",
    scheduleType: "oneshot",
    runAt: 1_000,
    nextRunAt: null,
    terminalState: "cancelled",
    terminalReason: "doctor cleanup",
    updatedAt: 1_000,
    ...overrides,
  } satisfies DoctorExternalJobRecord
}

const createJobRunRecord = (
  jobId: string,
  overrides: Partial<DoctorExternalJobRunRecord> = {}
): DoctorExternalJobRunRecord => {
  return {
    id: "run-1",
    jobId,
    startedAt: 1_000,
    finishedAt: 1_200,
    status: "failed",
    errorCode: "invalid_task_payload",
    errorMessage: "payload invalid",
    createdAt: 1_000,
    ...overrides,
  }
}

describe("deep job pipeline check", () => {
  it("returns ok when run completes and cleanup verification passes", async () => {
    // Arrange
    const probeJobId = "doctor.job.pipeline.test"
    const apiClient: DoctorExternalApiClient = {
      createJob: async () => createTaskMutationResult(probeJobId, "created"),
      runJobNow: async () => ({
        ...createTaskMutationResult(probeJobId, "run_now_scheduled"),
        scheduledFor: 1_000,
      }),
      getJob: async () => createJobRecord(probeJobId),
      listJobRuns: async () => ({
        taskId: probeJobId,
        total: 1,
        limit: 5,
        offset: 0,
        runs: [createJobRunRecord(probeJobId)],
      }),
      deleteJob: async () => createTaskMutationResult(probeJobId, "deleted"),
      cancelBackgroundJob: async () => null,
    }

    const check = createDeepJobPipelineCheck({
      now: () => 1_000,
      sleep: async () => {
        return
      },
      apiClient,
    })

    // Act
    const result = await check.run({ mode: "deep" })

    // Assert
    expect(result.severity).toBe("ok")
    expect(result.evidence.some((entry) => entry.code === "DEEP_JOB_PROBE_RUN_COMPLETED")).toBe(
      true
    )
    expect(result.evidence.some((entry) => entry.code === "DEEP_JOB_PROBE_CLEANUP_OK")).toBe(true)
    expect(result.evidence.some((entry) => entry.code === "DEEP_JOB_PROBE_OK")).toBe(true)
  })

  it("returns error when cleanup verification detects residual schedule", async () => {
    // Arrange
    const probeJobId = "doctor.job.pipeline.residual"
    const apiClient: DoctorExternalApiClient = {
      createJob: async () => createTaskMutationResult(probeJobId, "created"),
      runJobNow: async () => createTaskMutationResult(probeJobId, "run_now_scheduled"),
      getJob: async () =>
        createJobRecord(probeJobId, {
          nextRunAt: 9_000,
          terminalState: null,
          terminalReason: null,
        }),
      listJobRuns: async () => ({
        taskId: probeJobId,
        total: 1,
        limit: 5,
        offset: 0,
        runs: [createJobRunRecord(probeJobId)],
      }),
      deleteJob: async () => createTaskMutationResult(probeJobId, "deleted"),
      cancelBackgroundJob: async () => null,
    }

    const check = createDeepJobPipelineCheck({
      now: () => 1_000,
      sleep: async () => {
        return
      },
      apiClient,
    })

    // Act
    const result = await check.run({ mode: "deep" })

    // Assert
    expect(result.severity).toBe("error")
    expect(result.evidence.some((entry) => entry.code === "DOCTOR_JOB_RESIDUAL_SCHEDULED")).toBe(
      true
    )
  })

  it("returns error when run completion polling times out", async () => {
    // Arrange
    const probeJobId = "doctor.job.pipeline.timeout"
    let clock = 1_000

    const apiClient: DoctorExternalApiClient = {
      createJob: async () => createTaskMutationResult(probeJobId, "created"),
      runJobNow: async () => createTaskMutationResult(probeJobId, "run_now_scheduled"),
      getJob: async () => createJobRecord(probeJobId),
      listJobRuns: async () => ({
        taskId: probeJobId,
        total: 1,
        limit: 5,
        offset: 0,
        runs: [
          createJobRunRecord(probeJobId, {
            finishedAt: null,
            status: "skipped",
          }),
        ],
      }),
      deleteJob: async () => createTaskMutationResult(probeJobId, "deleted"),
      cancelBackgroundJob: async () => null,
    }

    const check = createDeepJobPipelineCheck({
      now: () => clock,
      sleep: async (ms) => {
        clock += ms
      },
      pollIntervalMs: 200,
      pollTimeoutMs: 600,
      apiClient,
    })

    // Act
    const result = await check.run({ mode: "deep" })

    // Assert
    expect(result.severity).toBe("error")
    expect(result.evidence.some((entry) => entry.code === "DEEP_JOB_PROBE_RUN_TIMEOUT")).toBe(true)
  })

  it("returns warning when probe gate blocks execution", async () => {
    // Arrange
    const check = createDeepJobPipelineCheck({
      probeDefinition: {
        id: "probe.job-pipeline.unsafe",
        mutating: true,
        cleanupRequired: true,
        cleanupGuaranteed: false,
        lockKey: "integration:job-pipeline",
      },
    })

    // Act
    const result = await check.run({ mode: "deep" })

    // Assert
    expect(result.severity).toBe("warning")
    expect(result.evidence[0]).toMatchObject({
      code: "PROBE_SKIPPED_CLEANUP_NOT_GUARANTEED",
    })
  })
})
