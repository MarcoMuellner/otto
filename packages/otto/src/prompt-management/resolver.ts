import {
  PROMPT_LAYER_ORDER,
  type PromptCompositionResult,
  type PromptLayerResolution,
  type PromptLayerType,
  type PromptResolutionWarning,
  type ResolvePromptCompositionInput,
} from "./types.js"

const normalizeLayerInputs = (layers: unknown): Partial<Record<PromptLayerType, unknown>> => {
  if (typeof layers !== "object" || layers === null || Array.isArray(layers)) {
    return {}
  }

  return layers as Partial<Record<PromptLayerType, unknown>>
}

const parseLayerInput = (
  layer: PromptLayerType,
  input: unknown
):
  | {
      status: "resolved"
      markdown: string
    }
  | {
      status: "missing"
    }
  | {
      status: "invalid"
      reason: string
    } => {
  if (input === undefined) {
    return {
      status: "missing",
    }
  }

  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return {
      status: "invalid",
      reason: `Layer input for '${layer}' must be an object`,
    }
  }

  const status = (input as { status?: unknown }).status
  if (status === "missing") {
    return {
      status: "missing",
    }
  }

  if (status === "resolved") {
    const markdown = (input as { markdown?: unknown }).markdown
    if (typeof markdown !== "string") {
      return {
        status: "invalid",
        reason: `Resolved layer '${layer}' must provide markdown as a string`,
      }
    }

    return {
      status: "resolved",
      markdown,
    }
  }

  if (status === "invalid") {
    const reason = (input as { reason?: unknown }).reason
    if (typeof reason !== "string" || reason.trim().length === 0) {
      return {
        status: "invalid",
        reason: `Invalid layer '${layer}' must provide a non-empty reason`,
      }
    }

    return {
      status: "invalid",
      reason,
    }
  }

  return {
    status: "invalid",
    reason: `Layer '${layer}' has unknown status`,
  }
}

const resolveLayer = (
  layer: PromptLayerType,
  input: unknown
): {
  layer: PromptLayerResolution
  warning: PromptResolutionWarning | null
} => {
  const parsedInput = parseLayerInput(layer, input)

  if (parsedInput.status === "missing") {
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

  if (parsedInput.status === "invalid") {
    return {
      layer: {
        layer,
        status: "invalid",
        reason: parsedInput.reason,
        applied: false,
      },
      warning: {
        code: "invalid_layer",
        layer,
        message: `Prompt layer '${layer}' is invalid: ${parsedInput.reason}`,
      },
    }
  }

  if (parsedInput.markdown.trim().length === 0) {
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
      markdown: parsedInput.markdown,
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
