import type { Logger } from "pino"

import {
  loadPromptLayerInputFromReference,
  loadPromptLayerInputFromRelativePath,
} from "./layer-loader.js"
import { resolvePromptComposition } from "./resolver.js"
import { loadPromptRoutingMapping, resolvePromptRoute } from "./routing.js"
import type { PromptLayerReference, PromptRouteFlow, PromptRouteMedia } from "./routing-types.js"
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
  routeKey: string
  mappingSource: "effective" | "system"
  profileId: string | null
  systemPrompt: string
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
  reference: PromptLayerReference
  absolutePath: string
  layerInput: PromptLayerInput
} | null> => {
  const relativePath = resolveTaskProfileRelativePath(input.profileId)

  const user = await loadPromptLayerInputFromRelativePath({
    ottoHome: input.ottoHome,
    source: "user",
    relativePath,
  })

  if (user.input.status !== "missing") {
    return {
      reference: {
        source: "user",
        path: relativePath,
      },
      absolutePath: user.absolutePath,
      layerInput: user.input,
    }
  }

  const system = await loadPromptLayerInputFromRelativePath({
    ottoHome: input.ottoHome,
    source: "system",
    relativePath,
  })

  if (system.input.status !== "missing") {
    return {
      reference: {
        source: "system",
        path: relativePath,
      },
      absolutePath: system.absolutePath,
      layerInput: system.input,
    }
  }

  return null
}

/**
 * Resolves one deterministic job/watchdog prompt chain from mapping + layered files while
 * keeping watchdog system-only and task-profile prompts job-specific.
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
  const layerReferences: Partial<Record<PromptLayerType, PromptLayerReference>> = {}
  const layerAbsolutePaths: Partial<Record<PromptLayerType, string>> = {}

  for (const layer of JOB_ROUTE_LAYER_TYPES) {
    const reference = resolvedRoute.route.layers[layer]
    if (!reference) {
      continue
    }

    const loaded = await loadPromptLayerInputFromReference({
      ottoHome: input.ottoHome,
      reference,
    })

    layerReferences[layer] = reference
    layerAbsolutePaths[layer] = loaded.absolutePath
    layerInputs[layer] = loaded.input
  }

  let taskProfileReference: PromptLayerReference | null = null
  let taskProfileAbsolutePath: string | null = null

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
        routeKey: resolvedRoute.routeKey,
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
      taskProfileReference = taskProfileLayer.reference
      taskProfileAbsolutePath = taskProfileLayer.absolutePath
    }
  }

  const composition = resolvePromptComposition({
    layers: layerInputs,
  })

  const compositionWarnings = composition.warnings.filter((warning) => {
    if (warning.layer === "task-profile") {
      return Boolean(taskProfileReference)
    }

    return Boolean(layerReferences[warning.layer])
  })

  for (const warning of compositionWarnings) {
    const reference =
      warning.layer === "task-profile" ? taskProfileReference : layerReferences[warning.layer]
    const absolutePath =
      warning.layer === "task-profile"
        ? taskProfileAbsolutePath
        : (layerAbsolutePaths[warning.layer] ?? null)

    if (!reference || !absolutePath) {
      continue
    }

    if (reference.source === "user") {
      input.logger?.error(
        {
          flow: input.flow,
          media: resolvedRoute.media,
          routeKey: resolvedRoute.routeKey,
          profileId,
          layer: warning.layer,
          source: reference.source,
          path: reference.path,
          absolutePath,
          warningCode: warning.code,
        },
        "User prompt layer issue detected for job execution; continuing with empty layer"
      )
      continue
    }

    input.logger?.warn(
      {
        flow: input.flow,
        media: resolvedRoute.media,
        routeKey: resolvedRoute.routeKey,
        profileId,
        layer: warning.layer,
        source: reference.source,
        path: reference.path,
        absolutePath,
        warningCode: warning.code,
      },
      "System prompt layer issue detected for job execution; continuing with empty layer"
    )
  }

  const warnings: JobPromptWarning[] = [
    ...resolvedRoute.warnings.map((warning) => toWarning(warning.code, warning.message)),
    ...(profileIdParsing.warning ? [profileIdParsing.warning] : []),
    ...compositionWarnings.map((warning) => toWarning(warning.code, warning.message)),
  ]

  return {
    flow: input.flow,
    media: resolvedRoute.media,
    routeKey: resolvedRoute.routeKey,
    mappingSource: resolvedRoute.mappingSource,
    profileId,
    systemPrompt: composition.markdown,
    warnings,
  }
}
