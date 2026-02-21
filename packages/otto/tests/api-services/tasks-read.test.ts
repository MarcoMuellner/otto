import { describe, expect, it } from "vitest"

import { getTaskById, listTasksForLane } from "../../src/api-services/tasks-read.js"
import type { JobRecord, TaskListRecord } from "../../src/persistence/repositories.js"

const createTaskListRecord = (id: string): TaskListRecord => {
  return {
    id,
    type: "heartbeat",
    scheduleType: "recurring",
    profileId: null,
    status: "idle",
    runAt: null,
    cadenceMinutes: 5,
    nextRunAt: 1_000,
    terminalState: null,
    terminalReason: null,
    updatedAt: 1_000,
  }
}

const createJobRecord = (id: string): JobRecord => {
  return {
    id,
    type: "heartbeat",
    status: "idle",
    scheduleType: "recurring",
    profileId: null,
    runAt: null,
    cadenceMinutes: 5,
    payload: null,
    lastRunAt: null,
    nextRunAt: 1_000,
    terminalState: null,
    terminalReason: null,
    lockToken: null,
    lockExpiresAt: null,
    createdAt: 1_000,
    updatedAt: 1_000,
  }
}

describe("tasks-read services", () => {
  it("returns task list for scheduled lane", () => {
    // Arrange
    const tasks = [createTaskListRecord("task-1")]
    const repository = {
      listTasks: (): TaskListRecord[] => tasks,
    }

    // Act
    const result = listTasksForLane(repository, "scheduled")

    // Assert
    expect(result).toEqual(tasks)
  })

  it("returns task list for interactive lane", () => {
    // Arrange
    const tasks = [createTaskListRecord("task-2")]
    const repository = {
      listTasks: (): TaskListRecord[] => tasks,
    }

    // Act
    const result = listTasksForLane(repository, "interactive")

    // Assert
    expect(result).toEqual(tasks)
  })

  it("returns job record by task id", () => {
    // Arrange
    const job = createJobRecord("job-1")
    const repository = {
      getById: (taskId: string): JobRecord | null => {
        return taskId === job.id ? job : null
      },
    }

    // Act
    const result = getTaskById(repository, "job-1")

    // Assert
    expect(result).toEqual(job)
  })

  it("returns null when task does not exist", () => {
    // Arrange
    const repository = {
      getById: (): JobRecord | null => null,
    }

    // Act
    const result = getTaskById(repository, "missing")

    // Assert
    expect(result).toBeNull()
  })
})
