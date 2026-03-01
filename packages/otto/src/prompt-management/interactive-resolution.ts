import type { Logger } from "pino"

import { buildPromptProvenance, type PromptProvenance } from "./provenance.js"
import { loadPromptLayerInputFromReference } from "./layer-loader.js"
import { resolvePromptComposition } from "./resolver.js"
import { loadPromptRoutingMapping, resolvePromptRoute } from "./routing.js"
import type { PromptLayerInput, PromptLayerType } from "./types.js"
import type { PromptLayerReference, PromptRouteMedia } from "./routing-types.js"

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
  routeKey: string
  mappingSource: "effective" | "system"
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
  const layerReferences: Partial<Record<PromptLayerType, PromptLayerReference>> = {}
  const layerAbsolutePaths: Partial<Record<PromptLayerType, string>> = {}
  for (const layer of INTERACTIVE_LAYER_TYPES) {
    const reference = resolvedRoute.route.layers[layer]
    if (!reference) {
      continue
    }

    layerReferences[layer] = reference
    const loaded = await loadPromptLayerInputFromReference({
      ottoHome: input.ottoHome,
      reference,
    })
    layerInputs[layer] = loaded.input
    layerAbsolutePaths[layer] = loaded.absolutePath
  }

  const composition = resolvePromptComposition({
    layers: layerInputs,
  })

  for (const warning of composition.warnings) {
    if (warning.layer === "task-profile") {
      continue
    }

    const reference = layerReferences[warning.layer]
    if (!reference) {
      continue
    }

    const absolutePath = layerAbsolutePaths[warning.layer] ?? null

    if (reference.source === "user") {
      input.logger?.error(
        {
          layer: warning.layer,
          source: reference.source,
          path: reference.path,
          absolutePath,
          warningCode: warning.code,
        },
        "User prompt layer issue detected; continuing with empty layer"
      )
    } else {
      input.logger?.warn(
        {
          layer: warning.layer,
          source: reference.source,
          path: reference.path,
          absolutePath,
          warningCode: warning.code,
        },
        "System prompt layer issue detected; continuing with empty layer"
      )
    }
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
    warnings,
  })

  return {
    flow: "interactive",
    surface: input.surface,
    media,
    routeKey: resolvedRoute.routeKey,
    mappingSource: resolvedRoute.mappingSource,
    systemPrompt: composition.markdown,
    provenance,
    warnings,
  }
}
