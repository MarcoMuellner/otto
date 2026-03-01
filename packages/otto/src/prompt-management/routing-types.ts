import type { PromptLayerType } from "./types.js"

export const PROMPT_ROUTE_FLOW_VALUES = [
  "interactive",
  "scheduled",
  "background",
  "watchdog",
] as const

export const PROMPT_ROUTE_MEDIA_VALUES = ["chatapps", "web", "cli"] as const

export const PROMPT_LAYER_SOURCE_VALUES = ["system", "user"] as const

export type PromptRouteFlow = (typeof PROMPT_ROUTE_FLOW_VALUES)[number]

export type PromptRouteMedia = (typeof PROMPT_ROUTE_MEDIA_VALUES)[number]

export type PromptLayerSource = (typeof PROMPT_LAYER_SOURCE_VALUES)[number]

export type PromptLayerReference = {
  source: PromptLayerSource
  path: string
}

export type PromptRouteDefinition = {
  layers: Partial<Record<PromptLayerType, PromptLayerReference>>
}

export type PromptFlowSelector = {
  default: string
  media: Partial<Record<PromptRouteMedia, string>>
}

export type PromptRoutingMapping = {
  selectors: Record<PromptRouteFlow, PromptFlowSelector>
  routes: Record<string, PromptRouteDefinition>
}

export type PromptRoutingWarningCode =
  | "invalid_user_mapping"
  | "unknown_user_entry"
  | "unknown_user_route"
  | "watchdog_user_override_blocked"

export type PromptRoutingWarning = {
  code: PromptRoutingWarningCode
  message: string
}

export type PromptRoutingLoadResult = {
  systemMappingPath: string
  userMappingPath: string
  system: PromptRoutingMapping
  effective: PromptRoutingMapping
  warnings: PromptRoutingWarning[]
}

export type ResolvePromptRouteContext = {
  flow: PromptRouteFlow
  media?: PromptRouteMedia | null
}

export type PromptRouteResolution = {
  flow: PromptRouteFlow
  media: PromptRouteMedia | null
  routeKey: string
  route: PromptRouteDefinition
  mappingSource: "effective" | "system"
  warnings: PromptRoutingWarning[]
}
