import { describe, expect, it } from "vitest"

import {
  getTaskById,
  listTasksForLane,
  mapTaskDetailsForExternal,
  mapTaskListForExternal,
  resolveTaskManagedBy,
} from "../../src/api-services/tasks-read.js"
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

  it("classifies system managed tasks by id prefix", () => {
    // Arrange
    const task = createTaskListRecord("system-heartbeat")

    // Act
    const result = resolveTaskManagedBy(task)

    // Assert
    expect(result).toBe("system")
  })

  it("classifies system managed tasks by reserved type", () => {
    // Arrange
    const task = createTaskListRecord("custom-id")

    // Act
    const result = resolveTaskManagedBy(task)

    // Assert
    expect(result).toBe("system")
  })

  it("classifies operator managed tasks and marks them mutable", () => {
    // Arrange
    const task: TaskListRecord = {
      ...createTaskListRecord("job-operator-1"),
      type: "custom-task",
    }

    // Act
    const mapped = mapTaskListForExternal(task)

    // Assert
    expect(mapped.managedBy).toBe("operator")
    expect(mapped.isMutable).toBe(true)
  })

  it("maps task details with mutability metadata", () => {
    // Arrange
    const job: JobRecord = {
      ...createJobRecord("system-watchdog-failures"),
      type: "watchdog_failures",
    }

    // Act
    const mapped = mapTaskDetailsForExternal(job)

    // Assert
    expect(mapped.managedBy).toBe("system")
    expect(mapped.isMutable).toBe(false)
  })
})
