import path from "node:path"
import { readFile } from "node:fs/promises"

import type { Logger } from "pino"

import { buildPromptProvenance, type PromptProvenance } from "./provenance.js"
import { loadPromptRoutingMapping, resolvePromptRoute } from "./routing.js"
import type {
  PromptLayerReference,
  PromptRouteFlow,
  PromptRouteMedia,
  PromptRouteResolution,
} from "./routing-types.js"
import { resolvePromptComposition } from "./resolver.js"
import type { PromptLayerInput, PromptLayerType } from "./types.js"

const SYSTEM_PROMPTS_DIRECTORY_NAME = "system-prompts"
const USER_PROMPTS_DIRECTORY_NAME = "prompts"

const JOB_LAYER_TYPES = ["core-persona", "surface", "media", "task-profile"] as const satisfies
  ReadonlyArray<PromptLayerType>

const resolvePromptRootDirectory = (
  ottoHome: string,
  source: PromptLayerReference["source"]
): string => {
  return path.join(
    ottoHome,
    source === "system" ? SYSTEM_PROMPTS_DIRECTORY_NAME : USER_PROMPTS_DIRECTORY_NAME
  )
}

const toWarning = (code: string, message: string): { code: string; message: string } => {
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

const logJobLayerWarning = (input: {
  logger?: Pick<Logger, "warn" | "error">
  ottoHome: string
  reference: PromptLayerReference | null
  layer: PromptLayerType
  warningCode: string
  message: string
}): void => {
  if (!input.reference) {
    input.logger?.warn(
      {
        layer: input.layer,
        warningCode: input.warningCode,
      },
      input.message
    )
    return
  }

  const rootDirectory = resolvePromptRootDirectory(input.ottoHome, input.reference.source)
  const absolutePath = path.join(rootDirectory, input.reference.path)

  if (input.reference.source === "user") {
    input.logger?.error(
      {
        layer: input.layer,
        source: input.reference.source,
        path: input.reference.path,
        absolutePath,
        warningCode: input.warningCode,
      },
      "User prompt layer issue detected during job resolution; continuing with empty layer"
    )
    return
  }

  input.logger?.warn(
    {
      layer: input.layer,
      source: input.reference.source,
      path: input.reference.path,
      absolutePath,
      warningCode: input.warningCode,
    },
    "System prompt layer issue detected during job resolution; continuing with empty layer"
  )
}

const resolveInlineTaskProfileLayerInput = (taskProfileMarkdown?: string): {
  applied: boolean
  layerInput?: PromptLayerInput
} => {
  if (typeof taskProfileMarkdown !== "string") {
    return {
      applied: false,
    }
  }

  return {
    applied: true,
    layerInput: {
      status: "resolved",
      markdown: taskProfileMarkdown,
    },
  }
}

const resolveLayerReferences = (
  resolvedRoute: PromptRouteResolution
): Partial<Record<PromptLayerType, PromptLayerReference>> => {
  const references: Partial<Record<PromptLayerType, PromptLayerReference>> = {}

  for (const layer of JOB_LAYER_TYPES) {
    const reference = resolvedRoute.route.layers[layer]
    if (!reference) {
      continue
    }

    references[layer] = reference
  }

  return references
}

/**
 * Resolves one deterministic job execution system prompt chain and provenance payload so
 * scheduled/background/watchdog runs can persist auditable prompt metadata.
 *
 * @param input Otto home path, flow/media context, optional inline task-profile, and logger.
 * @returns Resolved system prompt markdown plus provenance diagnostics.
 */
export const resolveJobSystemPrompt = async (input: {
  ottoHome: string
  flow: Exclude<PromptRouteFlow, "interactive">
  media?: PromptRouteMedia | null
  taskProfileMarkdown?: string
  logger?: Pick<Logger, "warn" | "error">
}): Promise<{ systemPrompt: string; provenance: PromptProvenance }> => {
  const mapping = await loadPromptRoutingMapping({
    ottoHome: input.ottoHome,
    logger: input.logger,
  })

  const resolvedRoute = resolvePromptRoute({
    mapping,
    context: {
      flow: input.flow,
      media: input.media,
    },
  })

  const layerInputs: Partial<Record<PromptLayerType, PromptLayerInput>> = {}
  const layerReferences = resolveLayerReferences(resolvedRoute)

  for (const layer of JOB_LAYER_TYPES) {
    if (layer === "task-profile") {
      continue
    }

    const reference = layerReferences[layer]
    if (!reference) {
      continue
    }

    layerInputs[layer] = await loadRouteLayerInput({
      ottoHome: input.ottoHome,
      reference,
    })
  }

  const inlineTaskProfile = resolveInlineTaskProfileLayerInput(input.taskProfileMarkdown)
  if (inlineTaskProfile.layerInput) {
    layerInputs["task-profile"] = inlineTaskProfile.layerInput
  }

  const composition = resolvePromptComposition({
    layers: layerInputs,
  })

  const compositionWarnings = composition.warnings.filter((warning) => {
    return !(warning.layer === "task-profile" && warning.code === "missing_layer")
  })

  for (const warning of compositionWarnings) {
    if (warning.layer === "task-profile" && inlineTaskProfile.applied) {
      input.logger?.warn(
        {
          layer: warning.layer,
          warningCode: warning.code,
        },
        "Inline task-profile prompt issue detected during job resolution; continuing with empty layer"
      )
      continue
    }

    const reference = layerReferences[warning.layer] ?? null
    logJobLayerWarning({
      logger: input.logger,
      ottoHome: input.ottoHome,
      reference,
      layer: warning.layer,
      warningCode: warning.code,
      message: warning.message,
    })
  }

  const warnings = [
    ...resolvedRoute.warnings.map((warning) => toWarning(warning.code, warning.message)),
    ...compositionWarnings.map((warning) => toWarning(warning.code, warning.message)),
  ]

  const provenance = buildPromptProvenance({
    resolvedRoute,
    layers: composition.layers,
    warnings,
    inlineTaskProfileApplied: inlineTaskProfile.applied,
  })

  return {
    systemPrompt: composition.markdown,
    provenance,
  }
}
