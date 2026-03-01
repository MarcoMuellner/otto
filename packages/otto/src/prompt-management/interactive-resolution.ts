import path from "node:path"
import { readFile } from "node:fs/promises"

import type { Logger } from "pino"

import { buildPromptProvenance, type PromptProvenance } from "./provenance.js"
import { resolvePromptComposition } from "./resolver.js"
import { loadPromptRoutingMapping, resolvePromptRoute } from "./routing.js"
import type { PromptLayerInput, PromptLayerType } from "./types.js"
import type { PromptLayerReference, PromptRouteMedia } from "./routing-types.js"

const SYSTEM_PROMPTS_DIRECTORY_NAME = "system-prompts"
const USER_PROMPTS_DIRECTORY_NAME = "prompts"

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

const resolvePromptRootDirectory = (
  ottoHome: string,
  source: PromptLayerReference["source"]
): string => {
  return path.join(
    ottoHome,
    source === "system" ? SYSTEM_PROMPTS_DIRECTORY_NAME : USER_PROMPTS_DIRECTORY_NAME
  )
}

const toWarning = (code: string, message: string): InteractivePromptWarning => {
  return {
    code,
    message,
  }
}

const loadRouteLayerInput = async (input: {
  ottoHome: string
  reference: PromptLayerReference
}): Promise<PromptLayerInput> => {
  const rootDirectory = resolvePromptRootDirectory(input.ottoHome, input.reference.source)
  const absolutePath = path.join(rootDirectory, input.reference.path)

  try {
    const markdown = await readFile(absolutePath, "utf8")

    return {
      status: "resolved",
      markdown,
    }
  } catch (error) {
    const fileError = error as NodeJS.ErrnoException
    if (fileError.code === "ENOENT") {
      return {
        status: "missing",
      }
    }

    const errorMessage = error instanceof Error ? error.message : String(error)

    return {
      status: "invalid",
      reason: `Unable to read prompt layer file at '${absolutePath}': ${errorMessage}`,
    }
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
  for (const layer of INTERACTIVE_LAYER_TYPES) {
    const reference = resolvedRoute.route.layers[layer]
    if (!reference) {
      continue
    }

    layerReferences[layer] = reference
    layerInputs[layer] = await loadRouteLayerInput({
      ottoHome: input.ottoHome,
      reference,
    })
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

    const rootDirectory = resolvePromptRootDirectory(input.ottoHome, reference.source)
    const absolutePath = path.join(rootDirectory, reference.path)

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
