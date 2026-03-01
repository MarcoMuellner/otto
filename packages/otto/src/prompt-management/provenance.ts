import { PROMPT_LAYER_ORDER, type PromptLayerResolution, type PromptLayerType } from "./types.js"
import type {
  PromptLayerReference,
  PromptRouteFlow,
  PromptRouteMedia,
  PromptRouteResolution,
} from "./routing-types.js"

export type PromptProvenanceLayer = {
  layer: PromptLayerType
  source: PromptLayerReference["source"] | "inline" | null
  path: string | null
  status: PromptLayerResolution["status"]
  applied: boolean
  reason: string | null
}

export type PromptProvenanceWarning = {
  code: string
  message: string
}

export type PromptProvenance = {
  version: 1
  flow: PromptRouteFlow
  media: PromptRouteMedia | null
  routeKey: string
  mappingSource: PromptRouteResolution["mappingSource"]
  layers: PromptProvenanceLayer[]
  warnings: PromptProvenanceWarning[]
}

const resolveLayerReference = (
  route: PromptRouteResolution["route"],
  layer: PromptLayerType
): PromptLayerReference | null => {
  const reference = route.layers[layer]
  return reference ?? null
}

/**
 * Builds one durable prompt provenance payload that can be persisted with run/session records
 * and surfaced by runtime APIs without exposing full prompt text history.
 *
 * @param input Resolved route context, per-layer resolution, and warning diagnostics.
 * @returns Stable provenance payload for persistence and API responses.
 */
export const buildPromptProvenance = (input: {
  resolvedRoute: PromptRouteResolution
  layers: PromptLayerResolution[]
  warnings: PromptProvenanceWarning[]
  inlineTaskProfileApplied?: boolean
}): PromptProvenance => {
  const layerByType = new Map(input.layers.map((layer) => [layer.layer, layer]))

  const layers: PromptProvenanceLayer[] = PROMPT_LAYER_ORDER.map((layerType) => {
    const resolved = layerByType.get(layerType)
    const reference = resolveLayerReference(input.resolvedRoute.route, layerType)

    if (layerType === "task-profile" && input.inlineTaskProfileApplied) {
      if (!resolved) {
        return {
          layer: layerType,
          source: "inline",
          path: "task-config:assistant.prompt",
          status: "missing",
          applied: false,
          reason: null,
        }
      }

      return {
        layer: layerType,
        source: "inline",
        path: "task-config:assistant.prompt",
        status: resolved.status,
        applied: resolved.applied,
        reason: resolved.status === "invalid" ? resolved.reason : null,
      }
    }

    if (!resolved) {
      return {
        layer: layerType,
        source: reference?.source ?? null,
        path: reference?.path ?? null,
        status: "missing",
        applied: false,
        reason: null,
      }
    }

    return {
      layer: layerType,
      source: reference?.source ?? null,
      path: reference?.path ?? null,
      status: resolved.status,
      applied: resolved.applied,
      reason: resolved.status === "invalid" ? resolved.reason : null,
    }
  })

  return {
    version: 1,
    flow: input.resolvedRoute.flow,
    media: input.resolvedRoute.media,
    routeKey: input.resolvedRoute.routeKey,
    mappingSource: input.resolvedRoute.mappingSource,
    layers,
    warnings: input.warnings,
  }
}
