import type { Logger } from "pino"

import {
  loadAdditivePromptLayerFromReference,
  loadAdditivePromptLayerFromRelativePath,
  type PromptLayerContribution,
} from "./layer-loader.js"
import { buildPromptProvenance, type PromptProvenance } from "./provenance.js"
import { resolvePromptComposition } from "./resolver.js"
import { loadPromptRoutingMapping, resolvePromptRoute } from "./routing.js"
import type { PromptRouteFlow, PromptRouteMedia } from "./routing-types.js"
import type { PromptLayerInput, PromptLayerType } from "./types.js"

const JOB_ROUTE_LAYER_TYPES = [
  "core-persona",
  "surface",
  "media",
] as const satisfies ReadonlyArray<PromptLayerType>
const TASK_PROFILE_DIRECTORY_NAME = "task-profiles"
const TASK_PROFILE_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/

export type JobPromptFlow = Exclude<PromptRouteFlow, "interactive">

export type JobPromptWarning = {
  code: string
  message: string
}

export type JobPromptResolution = {
  flow: JobPromptFlow
  media: PromptRouteMedia | null
  profileId: string | null
  systemPrompt: string
  provenance: PromptProvenance
  warnings: JobPromptWarning[]
}

const toWarning = (code: string, message: string): JobPromptWarning => {
  return {
    code,
    message,
  }
}

const normalizeTaskProfileId = (
  profileId: string | null | undefined
): {
  profileId: string | null
  warning: JobPromptWarning | null
} => {
  const trimmed = typeof profileId === "string" ? profileId.trim() : ""
  if (trimmed.length === 0) {
    return {
      profileId: null,
      warning: null,
    }
  }

  if (TASK_PROFILE_ID_PATTERN.test(trimmed)) {
    return {
      profileId: trimmed,
      warning: null,
    }
  }

  return {
    profileId: null,
    warning: toWarning(
      "invalid_task_profile_id",
      `Ignoring task profile '${trimmed}': profile id must match ${String(TASK_PROFILE_ID_PATTERN)}`
    ),
  }
}

const resolveTaskProfileRelativePath = (profileId: string): string => {
  return `${TASK_PROFILE_DIRECTORY_NAME}/${profileId}.md`
}

const loadTaskProfilePromptLayer = async (input: {
  ottoHome: string
  profileId: string
}): Promise<{
  contributions: PromptLayerContribution[]
  layerInput: PromptLayerInput
} | null> => {
  const relativePath = resolveTaskProfileRelativePath(input.profileId)

  const loaded = await loadAdditivePromptLayerFromRelativePath({
    ottoHome: input.ottoHome,
    relativePath,
  })

  if (loaded.input.status !== "missing") {
    return {
      contributions: loaded.contributions,
      layerInput: loaded.input,
    }
  }

  return null
}

/**
 * Resolves one deterministic job/watchdog prompt chain from mapping + layered files with
 * additive layer composition (system base + user append) for every layer.
 *
 * @param input Otto workspace root and route context for scheduled/background/watchdog flows.
 * @returns Resolved system prompt markdown plus route diagnostics.
 */
export const resolveJobSystemPrompt = async (input: {
  ottoHome: string
  flow: JobPromptFlow
  media?: PromptRouteMedia | null
  profileId?: string | null
  logger?: Pick<Logger, "warn" | "error">
}): Promise<JobPromptResolution> => {
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
  const layerContributions: Partial<Record<PromptLayerType, PromptLayerContribution[]>> = {}

  for (const layer of JOB_ROUTE_LAYER_TYPES) {
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

  const profileIdParsing =
    input.flow === "watchdog"
      ? { profileId: null, warning: null }
      : normalizeTaskProfileId(input.profileId)
  const profileId = profileIdParsing.profileId

  if (profileIdParsing.warning) {
    input.logger?.warn(
      {
        flow: input.flow,
        media: resolvedRoute.media,
        warningCode: profileIdParsing.warning.code,
      },
      profileIdParsing.warning.message
    )
  }

  if (profileId) {
    const taskProfileLayer = await loadTaskProfilePromptLayer({
      ottoHome: input.ottoHome,
      profileId,
    })

    if (taskProfileLayer) {
      layerInputs["task-profile"] = taskProfileLayer.layerInput
      layerContributions["task-profile"] = taskProfileLayer.contributions
    }
  }

  const composition = resolvePromptComposition({
    layers: layerInputs,
  })

  const compositionWarnings = composition.warnings.filter((warning) => {
    return Boolean(layerContributions[warning.layer])
  })

  for (const warning of compositionWarnings) {
    const contributions = layerContributions[warning.layer]
    if (!contributions || contributions.length === 0) {
      continue
    }

    input.logger?.warn(
      {
        flow: input.flow,
        media: resolvedRoute.media,
        profileId,
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
      "Prompt layer issue detected for job execution; continuing with available additive content"
    )
  }

  const warnings: JobPromptWarning[] = [
    ...resolvedRoute.warnings.map((warning) => toWarning(warning.code, warning.message)),
    ...(profileIdParsing.warning ? [profileIdParsing.warning] : []),
    ...compositionWarnings.map((warning) => toWarning(warning.code, warning.message)),
  ]

  const provenance = buildPromptProvenance({
    resolvedRoute,
    layers: composition.layers,
    layerContributions,
    warnings,
  })

  return {
    flow: input.flow,
    media: resolvedRoute.media,
    profileId,
    systemPrompt: composition.markdown,
    provenance,
    warnings,
  }
}
