import { PROMPT_LAYER_ORDER, type PromptLayerResolution, type PromptLayerType } from "./types.js"
import type { PromptLayerContribution } from "./layer-loader.js"
import type {
  PromptLayerReference,
  PromptRouteFlow,
  PromptRouteMedia,
  PromptRouteResolution,
} from "./routing-types.js"

export type PromptProvenanceLayerContributor = {
  source: PromptLayerReference["source"]
  path: string
  absolutePath: string
  status: PromptLayerResolution["status"]
  applied: boolean
  reason: string | null
}

export type PromptProvenanceLayer = {
  layer: PromptLayerType
  source: PromptLayerReference["source"] | "inline" | null
  path: string | null
  status: PromptLayerResolution["status"]
  applied: boolean
  reason: string | null
  contributors: PromptProvenanceLayerContributor[]
}

export type PromptProvenanceWarning = {
  code: string
  message: string
}

export type PromptProvenance = {
  version: 1
  flow: PromptRouteFlow
  media: PromptRouteMedia | null
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

const toProvenanceContributor = (
  contribution: PromptLayerContribution
): PromptProvenanceLayerContributor => {
  return {
    source: contribution.source,
    path: contribution.path,
    absolutePath: contribution.absolutePath,
    status: contribution.input.status,
    applied:
      contribution.input.status === "resolved" && contribution.input.markdown.trim().length > 0,
    reason: contribution.input.status === "invalid" ? contribution.input.reason : null,
  }
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
  layerContributions?: Partial<Record<PromptLayerType, PromptLayerContribution[]>>
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
          contributors: [],
        }
      }

      return {
        layer: layerType,
        source: "inline",
        path: "task-config:assistant.prompt",
        status: resolved.status,
        applied: resolved.applied,
        reason: resolved.status === "invalid" ? resolved.reason : null,
        contributors: [],
      }
    }

    const contributors = (input.layerContributions?.[layerType] ?? []).map(toProvenanceContributor)

    if (!resolved) {
      return {
        layer: layerType,
        source: reference?.source ?? null,
        path: reference?.path ?? null,
        status: "missing",
        applied: false,
        reason: null,
        contributors,
      }
    }

    return {
      layer: layerType,
      source: reference?.source ?? null,
      path: reference?.path ?? null,
      status: resolved.status,
      applied: resolved.applied,
      reason: resolved.status === "invalid" ? resolved.reason : null,
      contributors,
    }
  })

  return {
    version: 1,
    flow: input.resolvedRoute.flow,
    media: input.resolvedRoute.media,
    layers,
    warnings: input.warnings,
  }
}
