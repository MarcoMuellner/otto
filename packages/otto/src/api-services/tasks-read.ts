import type { JobRecord, TaskListRecord } from "../persistence/repositories.js"

export type TaskReadRepository = {
  listTasks: () => TaskListRecord[]
  getById: (jobId: string) => JobRecord | null
}

export type TaskLane = "interactive" | "scheduled"

/**
 * Centralizes task list reads for API adapters so internal and external route handlers
 * share one retrieval path while lane-level behavior evolves behind one function boundary.
 *
 * @param repository Task read repository.
 * @param lane Execution lane requested by caller.
 * @returns Task list records for the requested lane.
 */
export const listTasksForLane = (
  repository: Pick<TaskReadRepository, "listTasks">,
  lane: TaskLane
): TaskListRecord[] => {
  void lane
  return repository.listTasks()
}

/**
 * Keeps task detail lookups shared across API surfaces so not-found and response mapping
 * remain consistent as new adapters are introduced.
 *
 * @param repository Task read repository.
 * @param taskId Task identifier.
 * @returns Matching task record or null when missing.
 */
export const getTaskById = (
  repository: Pick<TaskReadRepository, "getById">,
  taskId: string
): JobRecord | null => {
  return repository.getById(taskId)
}
