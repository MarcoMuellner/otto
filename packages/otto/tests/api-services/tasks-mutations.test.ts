import { describe, expect, it } from "vitest"

import {
  createTaskMutation,
  deleteTaskMutation,
  runTaskNowMutation,
  TaskMutationError,
  updateTaskMutation,
} from "../../src/api-services/tasks-mutations.js"
import type { JobRecord, TaskAuditRecord } from "../../src/persistence/repositories.js"

const createJobRecord = (id: string, overrides: Partial<JobRecord> = {}): JobRecord => {
  return {
    id,
    type: "operator-task",
    status: "idle",
    scheduleType: "recurring",
    profileId: null,
    runAt: 1_000,
    cadenceMinutes: 15,
    payload: null,
    lastRunAt: null,
    nextRunAt: 1_000,
    terminalState: null,
    terminalReason: null,
    lockToken: null,
    lockExpiresAt: null,
    createdAt: 1_000,
    updatedAt: 1_000,
    ...overrides,
  }
}

const createMutationHarness = (seed: JobRecord[] = []) => {
  const jobs = new Map<string, JobRecord>(seed.map((job) => [job.id, { ...job }]))
  const audits: TaskAuditRecord[] = []

  return {
    jobs,
    audits,
    dependencies: {
      jobsRepository: {
        getById: (jobId: string): JobRecord | null => {
          return jobs.get(jobId) ?? null
        },
        createTask: (record: JobRecord): void => {
          jobs.set(record.id, { ...record })
        },
        updateTask: (
          jobId: string,
          update: {
            type: string
            scheduleType: "recurring" | "oneshot"
            profileId: string | null
            runAt: number | null
            cadenceMinutes: number | null
            payload: string | null
            nextRunAt: number | null
          },
          updatedAt = Date.now()
        ): void => {
          const existing = jobs.get(jobId)
          if (!existing) {
            return
          }

          jobs.set(jobId, {
            ...existing,
            ...update,
            updatedAt,
          })
        },
        cancelTask: (jobId: string, reason: string | null, updatedAt = Date.now()): void => {
          const existing = jobs.get(jobId)
          if (!existing) {
            return
          }

          jobs.set(jobId, {
            ...existing,
            status: "idle",
            nextRunAt: null,
            terminalState: "cancelled",
            terminalReason: reason,
            lockToken: null,
            lockExpiresAt: null,
            updatedAt,
          })
        },
        runTaskNow: (jobId: string, scheduledFor: number, updatedAt = Date.now()): void => {
          const existing = jobs.get(jobId)
          if (!existing) {
            return
          }

          jobs.set(jobId, {
            ...existing,
            status: "idle",
            nextRunAt: scheduledFor,
            terminalState: null,
            terminalReason: null,
            lockToken: null,
            lockExpiresAt: null,
            updatedAt,
          })
        },
      },
      taskAuditRepository: {
        insert: (record: TaskAuditRecord): void => {
          audits.push(record)
        },
      },
      now: () => 9_000,
    },
  }
}

describe("tasks-mutations service", () => {
  it("creates tasks and records a create audit entry", () => {
    // Arrange
    const harness = createMutationHarness()

    // Act
    const result = createTaskMutation(
      harness.dependencies,
      {
        type: "operator-task",
        scheduleType: "oneshot",
        runAt: 9_500,
      },
      {
        lane: "scheduled",
        actor: "control_plane",
        source: "external_api",
      }
    )

    // Assert
    expect(result.status).toBe("created")
    expect(harness.jobs.get(result.id)?.nextRunAt).toBe(9_500)
    expect(harness.audits[0]).toMatchObject({
      taskId: result.id,
      action: "create",
      lane: "scheduled",
      actor: "control_plane",
    })
  })

  it("rejects updates for system-managed jobs", () => {
    // Arrange
    const harness = createMutationHarness([
      createJobRecord("system-heartbeat", {
        type: "heartbeat",
      }),
    ])

    // Act
    let thrown: TaskMutationError | null = null
    try {
      updateTaskMutation(
        harness.dependencies,
        "system-heartbeat",
        {
          type: "mutated",
        },
        {
          lane: "scheduled",
          actor: "control_plane",
          source: "external_api",
        }
      )
    } catch (error) {
      if (error instanceof TaskMutationError) {
        thrown = error
      }
    }

    // Assert
    expect(thrown?.code).toBe("forbidden_mutation")
  })

  it("returns not_found when deleting unknown task", () => {
    // Arrange
    const harness = createMutationHarness()

    // Act
    let thrown: TaskMutationError | null = null
    try {
      deleteTaskMutation(
        harness.dependencies,
        "missing",
        {},
        {
          lane: "scheduled",
          actor: "control_plane",
          source: "external_api",
        }
      )
    } catch (error) {
      if (error instanceof TaskMutationError) {
        thrown = error
      }
    }

    // Assert
    expect(thrown?.code).toBe("not_found")
  })

  it("returns state conflict when run-now is requested for running task", () => {
    // Arrange
    const harness = createMutationHarness([
      createJobRecord("job-running", {
        status: "running",
      }),
    ])

    // Act
    let thrown: TaskMutationError | null = null
    try {
      runTaskNowMutation(harness.dependencies, "job-running", {
        lane: "scheduled",
        actor: "control_plane",
        source: "external_api",
      })
    } catch (error) {
      if (error instanceof TaskMutationError) {
        thrown = error
      }
    }

    // Assert
    expect(thrown?.code).toBe("state_conflict")
  })

  it("schedules immediate run-now and writes audit metadata", () => {
    // Arrange
    const harness = createMutationHarness([createJobRecord("job-run-now")])

    // Act
    const result = runTaskNowMutation(harness.dependencies, "job-run-now", {
      lane: "scheduled",
      actor: "control_plane",
      source: "external_api",
    })

    // Assert
    expect(result).toMatchObject({
      id: "job-run-now",
      status: "run_now_scheduled",
      scheduledFor: 9_000,
    })
    expect(harness.jobs.get("job-run-now")?.nextRunAt).toBe(9_000)

    const latestAudit = harness.audits[0]
    expect(latestAudit?.action).toBe("update")
    expect(latestAudit?.metadataJson).toContain("run_now")
  })

  it("preserves recurring schedule eligibility when runAt is explicitly null", () => {
    // Arrange
    const harness = createMutationHarness([
      createJobRecord("job-recurring", {
        scheduleType: "recurring",
        runAt: 3_000,
        nextRunAt: 6_000,
        cadenceMinutes: 10,
      }),
    ])

    // Act
    const result = updateTaskMutation(
      harness.dependencies,
      "job-recurring",
      {
        type: "operator-task-v2",
        runAt: null,
      },
      {
        lane: "scheduled",
        actor: "control_plane",
        source: "external_api",
      }
    )

    // Assert
    expect(result.status).toBe("updated")
    expect(harness.jobs.get("job-recurring")).toMatchObject({
      runAt: 3_000,
      nextRunAt: 6_000,
      type: "operator-task-v2",
    })
  })
})
