import {
  PROMPT_LAYER_ORDER,
  type PromptCompositionResult,
  type PromptLayerInput,
  type PromptLayerResolution,
  type PromptLayerType,
  type PromptResolutionWarning,
  type ResolvePromptCompositionInput,
} from "./types.js"

const normalizeLayerInputs = (
  layers: unknown
): Partial<Record<PromptLayerType, PromptLayerInput>> => {
  if (typeof layers !== "object" || layers === null || Array.isArray(layers)) {
    return {}
  }

  return layers as Partial<Record<PromptLayerType, PromptLayerInput>>
}

const resolveLayer = (
  layer: PromptLayerType,
  input: PromptLayerInput | undefined
): {
  layer: PromptLayerResolution
  warning: PromptResolutionWarning | null
} => {
  if (!input || input.status === "missing") {
    return {
      layer: {
        layer,
        status: "missing",
        applied: false,
      },
      warning: {
        code: "missing_layer",
        layer,
        message: `Prompt layer '${layer}' is missing and will be skipped.`,
      },
    }
  }

  if (input.status === "invalid") {
    return {
      layer: {
        layer,
        status: "invalid",
        reason: input.reason,
        applied: false,
      },
      warning: {
        code: "invalid_layer",
        layer,
        message: `Prompt layer '${layer}' is invalid: ${input.reason}`,
      },
    }
  }

  if (input.markdown.trim().length === 0) {
    return {
      layer: {
        layer,
        status: "invalid",
        reason: "Layer markdown is empty",
        applied: false,
      },
      warning: {
        code: "invalid_layer",
        layer,
        message: `Prompt layer '${layer}' is invalid: Layer markdown is empty`,
      },
    }
  }

  return {
    layer: {
      layer,
      status: "resolved",
      markdown: input.markdown,
      applied: true,
    },
    warning: null,
  }
}

/**
 * Resolves layered prompt input into one deterministic markdown payload so all runtime surfaces
 * can share the same composition contract and diagnostics semantics.
 *
 * @param input Layered prompt inputs keyed by canonical layer type.
 * @returns Ordered per-layer resolution, warning diagnostics, and assembled markdown output.
 */
export const resolvePromptComposition = (
  input: ResolvePromptCompositionInput
): PromptCompositionResult => {
  const layerInputs = normalizeLayerInputs(input?.layers)
  const layers: PromptLayerResolution[] = []
  const warnings: PromptResolutionWarning[] = []
  const segments: string[] = []

  for (const layerType of PROMPT_LAYER_ORDER) {
    const resolved = resolveLayer(layerType, layerInputs[layerType])
    layers.push(resolved.layer)

    if (resolved.layer.status === "resolved") {
      segments.push(resolved.layer.markdown)
    }

    if (resolved.warning) {
      warnings.push(resolved.warning)
    }
  }

  return {
    markdown: segments.join("\n\n"),
    segments,
    layers,
    warnings,
  }
}
