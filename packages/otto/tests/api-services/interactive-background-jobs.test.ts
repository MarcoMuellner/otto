import { describe, expect, it } from "vitest"

import { spawnInteractiveBackgroundJob } from "../../src/api-services/interactive-background-jobs.js"
import type { JobRecord, TaskAuditRecord } from "../../src/persistence/repositories.js"

const createSpawnDependencies = () => {
  const jobs = new Map<string, JobRecord>()

  return {
    jobs,
    dependencies: {
      jobsRepository: {
        getById: (jobId: string): JobRecord | null => jobs.get(jobId) ?? null,
        createTask: (record: JobRecord): void => {
          jobs.set(record.id, record)
        },
        updateTask: (): void => {
          return
        },
        cancelTask: (): void => {
          return
        },
        runTaskNow: (): void => {
          return
        },
      },
      taskAuditRepository: {
        insert: (_record: TaskAuditRecord): void => {
          return
        },
      },
      now: () => 10_000,
    },
  }
}

describe("interactive-background-jobs service", () => {
  it("requires content whenever prompt is provided", () => {
    // Arrange
    const harness = createSpawnDependencies()

    // Act + Assert
    expect(() => {
      spawnInteractiveBackgroundJob(harness.dependencies, {
        request: "Fallback request",
        prompt: "Prompt override",
      })
    }).toThrow(/content is required when prompt is provided/)
  })

  it("persists prompt and content payload for execution", () => {
    // Arrange
    const harness = createSpawnDependencies()

    // Act
    const created = spawnInteractiveBackgroundJob(harness.dependencies, {
      request: "Fallback request",
      prompt: "Prompt override",
      content: {
        key: "value",
      },
    })

    // Assert
    const persisted = harness.jobs.get(created.jobId)
    expect(persisted).not.toBeUndefined()
    const payload = persisted?.payload ? JSON.parse(persisted.payload) : null
    expect(payload).toMatchObject({
      input: {
        prompt: "Prompt override",
        content: {
          key: "value",
        },
      },
      request: {
        text: "Prompt override",
      },
    })
  })
})
