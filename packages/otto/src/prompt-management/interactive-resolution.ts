import type { Logger } from "pino"

import { buildPromptProvenance, type PromptProvenance } from "./provenance.js"
import {
  loadAdditivePromptLayerFromReference,
  type PromptLayerContribution,
} from "./layer-loader.js"
import { resolvePromptComposition } from "./resolver.js"
import { loadPromptRoutingMapping, resolvePromptRoute } from "./routing.js"
import type { PromptLayerInput, PromptLayerType } from "./types.js"
import type { PromptRouteMedia } from "./routing-types.js"

const INTERACTIVE_LAYER_TYPES = [
  "core-persona",
  "surface",
  "media",
] as const satisfies ReadonlyArray<PromptLayerType>

const INTERACTIVE_SURFACE_TO_MEDIA = {
  telegram: "chatapps",
  web: "web",
  cli: "cli",
} as const satisfies Record<string, PromptRouteMedia>

export type InteractivePromptSurface = keyof typeof INTERACTIVE_SURFACE_TO_MEDIA

export type InteractivePromptWarning = {
  code: string
  message: string
}

export type InteractivePromptResolution = {
  flow: "interactive"
  surface: InteractivePromptSurface
  media: PromptRouteMedia
  systemPrompt: string
  provenance: PromptProvenance
  warnings: InteractivePromptWarning[]
}

const resolveInteractiveMedia = (surface: InteractivePromptSurface): PromptRouteMedia => {
  return INTERACTIVE_SURFACE_TO_MEDIA[surface]
}

const toWarning = (code: string, message: string): InteractivePromptWarning => {
  return {
    code,
    message,
  }
}

/**
 * Resolves one explicit interactive system prompt chain (`core + surface + media`) for the
 * requested surface so Telegram, web, and future CLI chat turns share one runtime source of truth.
 *
 * @param input Otto workspace root, interactive surface, and optional logger.
 * @returns Resolved system prompt markdown plus route diagnostics.
 */
export const resolveInteractiveSystemPrompt = async (input: {
  ottoHome: string
  surface: InteractivePromptSurface
  logger?: Pick<Logger, "warn" | "error">
}): Promise<InteractivePromptResolution> => {
  const media = resolveInteractiveMedia(input.surface)
  const mapping = await loadPromptRoutingMapping({
    ottoHome: input.ottoHome,
    logger: input.logger,
  })

  const resolvedRoute = resolvePromptRoute({
    mapping,
    context: {
      flow: "interactive",
      media,
    },
  })

  const layerInputs: Partial<Record<PromptLayerType, PromptLayerInput>> = {}
  const layerContributions: Partial<Record<PromptLayerType, PromptLayerContribution[]>> = {}
  for (const layer of INTERACTIVE_LAYER_TYPES) {
    const reference = resolvedRoute.route.layers[layer]
    if (!reference) {
      continue
    }

    const loaded = await loadAdditivePromptLayerFromReference({
      ottoHome: input.ottoHome,
      reference,
    })
    layerInputs[layer] = loaded.input
    layerContributions[layer] = loaded.contributions
  }

  const composition = resolvePromptComposition({
    layers: layerInputs,
  })

  for (const warning of composition.warnings) {
    if (warning.layer === "task-profile") {
      continue
    }

    const contributions = layerContributions[warning.layer]
    if (!contributions || contributions.length === 0) {
      continue
    }

    input.logger?.warn(
      {
        layer: warning.layer,
        warningCode: warning.code,
        contributions: contributions.map((contribution) => ({
          source: contribution.source,
          path: contribution.path,
          absolutePath: contribution.absolutePath,
          status: contribution.input.status,
          ...(contribution.input.status === "invalid" ? { reason: contribution.input.reason } : {}),
        })),
      },
      "Prompt layer issue detected; continuing with available additive content"
    )
  }

  const warnings: InteractivePromptWarning[] = [
    ...resolvedRoute.warnings.map((warning) => toWarning(warning.code, warning.message)),
    ...composition.warnings
      .filter((warning) => warning.layer !== "task-profile")
      .map((warning) => toWarning(warning.code, warning.message)),
  ]

  const provenance = buildPromptProvenance({
    resolvedRoute,
    layers: composition.layers,
    layerContributions,
    warnings,
  })

  return {
    flow: "interactive",
    surface: input.surface,
    media,
    systemPrompt: composition.markdown,
    provenance,
    warnings,
  }
}
