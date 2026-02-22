export type RuntimeModelFlow =
  | "interactiveAssistant"
  | "scheduledTasks"
  | "heartbeat"
  | "watchdogFailures"

export type ModelSelectionSource =
  | "job"
  | "flow_default"
  | "global_default"
  | "fallback_global_default"

export type ResolvedRuntimeModel = {
  providerId: string
  modelId: string
  source: ModelSelectionSource
}

export type ModelCatalogSnapshot = {
  refs: string[]
  updatedAt: number | null
  source: "network" | "cache"
}
