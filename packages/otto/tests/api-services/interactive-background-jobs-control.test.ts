import { describe, expect, it, vi } from "vitest"

import { INTERACTIVE_BACKGROUND_ONESHOT_JOB_TYPE } from "../../src/api-services/interactive-background-jobs.js"
import {
  cancelInteractiveBackgroundJob,
  getInteractiveBackgroundJobById,
  listInteractiveBackgroundJobs,
} from "../../src/api-services/interactive-background-jobs-control.js"
import type {
  JobRecord,
  JobRunRecord,
  JobRunSessionRecord,
  TaskAuditRecord,
  TaskListRecord,
} from "../../src/persistence/repositories.js"

const createBackgroundJob = (id: string, overrides: Partial<JobRecord> = {}): JobRecord => {
  return {
    id,
    type: INTERACTIVE_BACKGROUND_ONESHOT_JOB_TYPE,
    status: "idle",
    scheduleType: "oneshot",
    profileId: null,
    modelRef: null,
    runAt: 1_000,
    cadenceMinutes: null,
    payload: JSON.stringify({
      version: 1,
      source: {
        surface: "interactive",
        sessionId: "session-origin-1",
        sourceMessageId: "msg-1",
        chatId: 777,
      },
      request: {
        text: "Draft migration plan",
        requestedAt: 900,
        rationale: "Long-running request",
      },
    }),
    lastRunAt: null,
    nextRunAt: 1_000,
    terminalState: null,
    terminalReason: null,
    lockToken: "lock-1",
    lockExpiresAt: 2_000,
    createdAt: 500,
    updatedAt: 500,
    ...overrides,
  }
}

describe("interactive background jobs control service", () => {
  it("lists only interactive background one-shot jobs", () => {
    // Arrange
    const backgroundJob = createBackgroundJob("job-background-1")
    const tasks: TaskListRecord[] = [
      {
        id: backgroundJob.id,
        type: backgroundJob.type,
        scheduleType: backgroundJob.scheduleType,
        profileId: backgroundJob.profileId,
        modelRef: backgroundJob.modelRef,
        status: backgroundJob.status,
        runAt: backgroundJob.runAt,
        cadenceMinutes: backgroundJob.cadenceMinutes,
        nextRunAt: backgroundJob.nextRunAt,
        terminalState: backgroundJob.terminalState,
        terminalReason: backgroundJob.terminalReason,
        updatedAt: backgroundJob.updatedAt,
      },
      {
        id: "job-scheduled-1",
        type: "general-reminder",
        scheduleType: "recurring",
        profileId: null,
        modelRef: null,
        status: "idle",
        runAt: null,
        cadenceMinutes: 15,
        nextRunAt: 2_000,
        terminalState: null,
        terminalReason: null,
        updatedAt: 2_000,
      },
    ]

    // Act
    const result = listInteractiveBackgroundJobs({
      jobsRepository: {
        listTasks: () => tasks,
      },
    })

    // Assert
    expect(result).toEqual([
      {
        jobId: "job-background-1",
        status: "idle",
        terminalState: null,
        terminalReason: null,
        nextRunAt: 1_000,
        updatedAt: 500,
      },
    ])
  })

  it("returns detailed background job with latest run and active sessions", () => {
    // Arrange
    const backgroundJob = createBackgroundJob("job-background-2")
    const latestRun: JobRunRecord = {
      id: "run-1",
      jobId: backgroundJob.id,
      scheduledFor: 1_000,
      startedAt: 1_010,
      finishedAt: null,
      status: "failed",
      errorCode: "task_execution_error",
      errorMessage: "Session aborted",
      resultJson: null,
      createdAt: 1_010,
    }
    const activeSessions: JobRunSessionRecord[] = [
      {
        runId: "run-1",
        jobId: backgroundJob.id,
        sessionId: "session-run-1",
        createdAt: 1_010,
        closedAt: null,
        closeErrorMessage: null,
      },
    ]

    // Act
    const result = getInteractiveBackgroundJobById(
      {
        jobsRepository: {
          getById: () => backgroundJob,
          listRunsByJobId: () => [latestRun],
        },
        jobRunSessionsRepository: {
          listActiveByJobId: () => activeSessions,
        },
      },
      backgroundJob.id
    )

    // Assert
    expect(result?.job.id).toBe(backgroundJob.id)
    expect(result?.latestRun?.id).toBe("run-1")
    expect(result?.activeRunSessions).toHaveLength(1)
    expect(result?.payload?.request.text).toContain("Draft migration plan")
    expect(result?.payloadParseError).toBeNull()
  })

  it("cancels running background jobs and stops active run sessions", async () => {
    // Arrange
    const jobs = new Map<string, JobRecord>([
      [
        "job-background-3",
        createBackgroundJob("job-background-3", {
          status: "running",
          terminalState: null,
          terminalReason: null,
        }),
      ],
    ])
    const audits: TaskAuditRecord[] = []
    const activeSessions: JobRunSessionRecord[] = [
      {
        runId: "run-3",
        jobId: "job-background-3",
        sessionId: "session-run-3",
        createdAt: 1_100,
        closedAt: null,
        closeErrorMessage: null,
      },
    ]

    const closeSession = vi.fn(async () => {})

    // Act
    const result = await cancelInteractiveBackgroundJob(
      {
        jobsRepository: {
          getById: (jobId) => jobs.get(jobId) ?? null,
          cancelTask: (jobId, reason, updatedAt = Date.now()) => {
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
        },
        jobRunSessionsRepository: {
          listActiveByJobId: () => activeSessions,
          markClosed: (runId, closedAt, closeErrorMessage) => {
            const index = activeSessions.findIndex((entry) => entry.runId === runId)
            if (index < 0) {
              return
            }

            activeSessions[index] = {
              ...activeSessions[index],
              closedAt,
              closeErrorMessage,
            }
          },
        },
        taskAuditRepository: {
          insert: (record) => audits.push(record),
        },
        sessionController: {
          closeSession,
        },
        now: () => 9_000,
      },
      {
        jobId: "job-background-3",
        reason: "User requested cancellation",
        actor: "internal_tool",
        source: "internal_api",
      }
    )

    // Assert
    expect(result).toMatchObject({
      jobId: "job-background-3",
      outcome: "cancelled",
      terminalState: "cancelled",
    })
    expect(closeSession).toHaveBeenCalledWith("session-run-3")
    expect(jobs.get("job-background-3")?.terminalState).toBe("cancelled")
    expect(activeSessions[0]?.closedAt).toBe(9_000)
    expect(audits[0]?.action).toBe("delete")
    expect(audits[0]?.metadataJson).toContain("cancel_background_task")
  })

  it("keeps completed background jobs unchanged when cancel is requested", async () => {
    // Arrange
    const completedJob = createBackgroundJob("job-background-4", {
      status: "idle",
      terminalState: "completed",
      terminalReason: null,
      lockToken: null,
      lockExpiresAt: null,
    })
    const jobs = new Map<string, JobRecord>([[completedJob.id, completedJob]])

    // Act
    const result = await cancelInteractiveBackgroundJob(
      {
        jobsRepository: {
          getById: (jobId) => jobs.get(jobId) ?? null,
          cancelTask: () => {
            throw new Error("cancelTask should not run for completed jobs")
          },
        },
        jobRunSessionsRepository: {
          listActiveByJobId: () => [],
          markClosed: () => {},
        },
        taskAuditRepository: {
          insert: () => {},
        },
      },
      {
        jobId: completedJob.id,
        actor: "internal_tool",
        source: "internal_api",
      }
    )

    // Assert
    expect(result).toMatchObject({
      jobId: completedJob.id,
      outcome: "already_terminal",
      terminalState: "completed",
    })
  })
})
