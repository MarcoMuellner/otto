import type { JobRecord, TaskListRecord } from "../persistence/repositories.js"

export type TaskReadRepository = {
  listTasks: () => TaskListRecord[]
  getById: (jobId: string) => JobRecord | null
}

export type TaskLane = "interactive" | "scheduled"
export type TaskManagedBy = "system" | "operator"

export type ExternalTaskListRecord = TaskListRecord & {
  managedBy: TaskManagedBy
  isMutable: boolean
}

export type ExternalTaskDetailsRecord = JobRecord & {
  managedBy: TaskManagedBy
  isMutable: boolean
}

const SYSTEM_TASK_ID_PREFIX = "system-"
const SYSTEM_TASK_TYPES = new Set(["heartbeat", "watchdog_failures"])

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

/**
 * Centralizes task ownership classification so UI-facing APIs can consistently separate
 * read-only system jobs from operator-managed jobs.
 *
 * @param task Task identity and type fields.
 * @returns Ownership classification used by external API DTOs.
 */
export const resolveTaskManagedBy = (task: Pick<TaskListRecord, "id" | "type">): TaskManagedBy => {
  if (task.id.startsWith(SYSTEM_TASK_ID_PREFIX) || SYSTEM_TASK_TYPES.has(task.type)) {
    return "system"
  }

  return "operator"
}

/**
 * Maps scheduler list rows to external API records with mutability metadata so downstream
 * UI clients can enforce read-only behavior without hardcoding task-type logic.
 *
 * @param record Raw persisted task list record.
 * @returns External list record with ownership and mutability flags.
 */
export const mapTaskListForExternal = (record: TaskListRecord): ExternalTaskListRecord => {
  const managedBy = resolveTaskManagedBy(record)

  return {
    ...record,
    managedBy,
    isMutable: managedBy === "operator",
  }
}

/**
 * Maps task detail rows to external API records with mutability metadata so detail views and
 * mutation guards share one ownership interpretation.
 *
 * @param record Raw persisted task detail record.
 * @returns External task detail record with ownership and mutability flags.
 */
export const mapTaskDetailsForExternal = (record: JobRecord): ExternalTaskDetailsRecord => {
  const managedBy = resolveTaskManagedBy(record)

  return {
    ...record,
    managedBy,
    isMutable: managedBy === "operator",
  }
}
