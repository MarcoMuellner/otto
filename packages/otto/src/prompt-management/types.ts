export const PROMPT_LAYER_ORDER = ["core-persona", "surface", "media", "task-profile"] as const

export type PromptLayerType = (typeof PROMPT_LAYER_ORDER)[number]

export type PromptLayerInput =
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
    }

export type PromptLayerResolution =
  | {
      layer: PromptLayerType
      status: "resolved"
      markdown: string
      applied: true
    }
  | {
      layer: PromptLayerType
      status: "missing"
      applied: false
    }
  | {
      layer: PromptLayerType
      status: "invalid"
      reason: string
      applied: false
    }

export type PromptResolutionWarningCode = "missing_layer" | "invalid_layer"

export type PromptResolutionWarning = {
  code: PromptResolutionWarningCode
  layer: PromptLayerType
  message: string
}

export type ResolvePromptCompositionInput = {
  layers: Partial<Record<PromptLayerType, PromptLayerInput>>
}

export type PromptCompositionResult = {
  markdown: string
  segments: string[]
  layers: PromptLayerResolution[]
  warnings: PromptResolutionWarning[]
}
