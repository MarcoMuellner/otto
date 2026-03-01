import path from "node:path"
import { readFile } from "node:fs/promises"

import { parseJsonc } from "otto-extension-sdk"
import type { Logger } from "pino"
import { z } from "zod"

import {
  PROMPT_LAYER_SOURCE_VALUES,
  PROMPT_ROUTE_FLOW_VALUES,
  PROMPT_ROUTE_MEDIA_VALUES,
  type PromptFlowSelector,
  type PromptLayerReference,
  type PromptRouteDefinition,
  type PromptRouteFlow,
  type PromptRouteMedia,
  type PromptRouteResolution,
  type PromptRoutingLoadResult,
  type PromptRoutingMapping,
  type PromptRoutingWarning,
  type ResolvePromptRouteContext,
} from "./routing-types.js"

const SYSTEM_PROMPTS_DIRECTORY_NAME = "system-prompts"
const USER_PROMPTS_DIRECTORY_NAME = "prompts"
const MAPPING_FILE_NAME = "mapping.jsonc"

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

const routeKeySchema = z.string().trim().min(1)

const mediaSelectorSchema = z
  .object({
    chatapps: routeKeySchema.optional(),
    web: routeKeySchema.optional(),
    cli: routeKeySchema.optional(),
  })
  .strict()

const isRelativePromptPath = (value: string): boolean => {
  if (path.isAbsolute(value)) {
    return false
  }

  const normalized = value.replace(/\\/g, "/")
  const segments = normalized.split("/").filter((segment) => segment.length > 0)
  if (segments.includes("..")) {
    return false
  }

  return true
}

const promptLayerReferenceSchema = z
  .object({
    source: z.enum(PROMPT_LAYER_SOURCE_VALUES),
    path: z.string().trim().min(1),
  })
  .strict()
  .superRefine((input, context) => {
    if (isRelativePromptPath(input.path)) {
      return
    }

    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "path must be a relative file path within prompt roots",
      path: ["path"],
    })
  })

const routeLayersSchema = z
  .object({
    "core-persona": promptLayerReferenceSchema.optional(),
    surface: promptLayerReferenceSchema.optional(),
    media: promptLayerReferenceSchema.optional(),
    "task-profile": promptLayerReferenceSchema.optional(),
  })
  .strict()
  .superRefine((layers, context) => {
    const hasAtLeastOneLayer =
      layers["core-persona"] !== undefined ||
      layers.surface !== undefined ||
      layers.media !== undefined ||
      layers["task-profile"] !== undefined

    if (hasAtLeastOneLayer) {
      return
    }

    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "route must define at least one layer",
      path: ["layers"],
    })
  })

const routeDefinitionSchema = z
  .object({
    layers: routeLayersSchema,
  })
  .strict()

const flowSelectorSchema = z
  .object({
    default: routeKeySchema,
    media: mediaSelectorSchema.default({}),
  })
  .strict()

const systemMappingSchema = z
  .object({
    version: z.literal(1),
    selectors: z
      .object({
        interactive: flowSelectorSchema,
        scheduled: flowSelectorSchema,
        background: flowSelectorSchema,
        watchdog: flowSelectorSchema,
      })
      .strict(),
    routes: z.record(routeKeySchema, routeDefinitionSchema),
  })
  .strict()

type UserMappingOverlay = {
  selectors: Partial<
    Record<
      PromptRouteFlow,
      {
        default?: string
        media?: Partial<Record<PromptRouteMedia, string>>
      }
    >
  >
  routes: Record<string, PromptRouteDefinition>
  warnings: PromptRoutingWarning[]
}

const formatZodIssuePath = (issues: z.ZodIssue[]): string => {
  return issues
    .map((issue) => {
      const location = issue.path.length > 0 ? issue.path.join(".") : "root"
      return `${location}: ${issue.message}`
    })
    .join("; ")
}

const resolvePromptMappingPaths = (
  ottoHome: string
): {
  systemMappingPath: string
  userMappingPath: string
} => {
  return {
    systemMappingPath: path.join(ottoHome, SYSTEM_PROMPTS_DIRECTORY_NAME, MAPPING_FILE_NAME),
    userMappingPath: path.join(ottoHome, USER_PROMPTS_DIRECTORY_NAME, MAPPING_FILE_NAME),
  }
}

const parseJsoncContent = (source: string, filePath: string): unknown => {
  try {
    return parseJsonc(source)
  } catch {
    throw new Error(`Invalid JSONC in prompt mapping file: ${filePath}`)
  }
}

const assertSelectorRouteReferences = (
  selectors: Record<PromptRouteFlow, PromptFlowSelector>,
  routes: Record<string, PromptRouteDefinition>,
  filePath: string
): void => {
  for (const flow of PROMPT_ROUTE_FLOW_VALUES) {
    const selector = selectors[flow]

    if (!routes[selector.default]) {
      throw new Error(
        `Invalid prompt mapping in ${filePath}: selectors.${flow}.default references unknown route '${selector.default}'`
      )
    }

    for (const media of PROMPT_ROUTE_MEDIA_VALUES) {
      const routeKey = selector.media[media]
      if (!routeKey) {
        continue
      }

      if (!routes[routeKey]) {
        throw new Error(
          `Invalid prompt mapping in ${filePath}: selectors.${flow}.media.${media} references unknown route '${routeKey}'`
        )
      }
    }
  }
}

const assertWatchdogRoutesAreSystemOnly = (
  selectors: Record<PromptRouteFlow, PromptFlowSelector>,
  routes: Record<string, PromptRouteDefinition>,
  filePath: string
): void => {
  const watchdogRouteKeys = new Set<string>([selectors.watchdog.default])
  for (const media of PROMPT_ROUTE_MEDIA_VALUES) {
    const routeKey = selectors.watchdog.media[media]
    if (routeKey) {
      watchdogRouteKeys.add(routeKey)
    }
  }

  for (const routeKey of watchdogRouteKeys) {
    const route = routes[routeKey]
    if (!route) {
      continue
    }

    for (const [layer, reference] of Object.entries(route.layers)) {
      if (!reference || reference.source === "system") {
        continue
      }

      throw new Error(
        `Invalid prompt mapping in ${filePath}: watchdog route '${routeKey}' layer '${layer}' must use source 'system'`
      )
    }
  }
}

const cloneRouteDefinition = (route: PromptRouteDefinition): PromptRouteDefinition => {
  const layers: PromptRouteDefinition["layers"] = {}

  for (const [layer, reference] of Object.entries(route.layers) as Array<
    [keyof PromptRouteDefinition["layers"], PromptLayerReference | undefined]
  >) {
    if (!reference) {
      continue
    }

    layers[layer] = {
      source: reference.source,
      path: reference.path,
    }
  }

  return {
    layers,
  }
}

const parseSystemMapping = (
  parsed: unknown,
  filePath: string
): {
  selectors: Record<PromptRouteFlow, PromptFlowSelector>
  routes: Record<string, PromptRouteDefinition>
} => {
  const validated = systemMappingSchema.safeParse(parsed)
  if (!validated.success) {
    const detail = formatZodIssuePath(validated.error.issues)
    throw new Error(`Invalid prompt mapping in ${filePath}: ${detail}`)
  }

  const selectors: Record<PromptRouteFlow, PromptFlowSelector> = {
    interactive: {
      default: validated.data.selectors.interactive.default,
      media: { ...validated.data.selectors.interactive.media },
    },
    scheduled: {
      default: validated.data.selectors.scheduled.default,
      media: { ...validated.data.selectors.scheduled.media },
    },
    background: {
      default: validated.data.selectors.background.default,
      media: { ...validated.data.selectors.background.media },
    },
    watchdog: {
      default: validated.data.selectors.watchdog.default,
      media: { ...validated.data.selectors.watchdog.media },
    },
  }

  const routes = Object.fromEntries(
    Object.entries(validated.data.routes).map(([routeKey, route]) => {
      return [routeKey, cloneRouteDefinition(route)]
    })
  )

  assertSelectorRouteReferences(selectors, routes, filePath)
  assertWatchdogRoutesAreSystemOnly(selectors, routes, filePath)

  return {
    selectors,
    routes,
  }
}

const parseUserRouteKey = (
  value: unknown,
  location: string,
  warnings: PromptRoutingWarning[]
): string | undefined => {
  const validated = routeKeySchema.safeParse(value)
  if (validated.success) {
    return validated.data
  }

  warnings.push({
    code: "invalid_user_mapping",
    message: `Skipping invalid user mapping entry '${location}': route key must be a non-empty string`,
  })
  return undefined
}

const parseUserFlowSelectorOverride = (
  flow: string,
  value: unknown,
  warnings: PromptRoutingWarning[]
): {
  default?: string
  media?: Partial<Record<PromptRouteMedia, string>>
} | null => {
  if (!isRecord(value)) {
    warnings.push({
      code: "invalid_user_mapping",
      message: `Skipping invalid user mapping entry 'selectors.${flow}': selector must be an object`,
    })
    return null
  }

  const selector: {
    default?: string
    media?: Partial<Record<PromptRouteMedia, string>>
  } = {}

  for (const key of Object.keys(value)) {
    if (["default", "media"].includes(key)) {
      continue
    }

    warnings.push({
      code: "unknown_user_entry",
      message: `Skipping unknown user mapping entry 'selectors.${flow}.${key}'`,
    })
  }

  if (Object.prototype.hasOwnProperty.call(value, "default")) {
    const parsedDefault = parseUserRouteKey(value.default, `selectors.${flow}.default`, warnings)
    if (parsedDefault) {
      selector.default = parsedDefault
    }
  }

  if (Object.prototype.hasOwnProperty.call(value, "media")) {
    const mediaValue = value.media
    if (!isRecord(mediaValue)) {
      warnings.push({
        code: "invalid_user_mapping",
        message: `Skipping invalid user mapping entry 'selectors.${flow}.media': media selector must be an object`,
      })
    } else {
      const media: Partial<Record<PromptRouteMedia, string>> = {}

      for (const [mediaKey, routeKeyValue] of Object.entries(mediaValue)) {
        if (!PROMPT_ROUTE_MEDIA_VALUES.includes(mediaKey as PromptRouteMedia)) {
          warnings.push({
            code: "unknown_user_entry",
            message: `Skipping unknown user mapping entry 'selectors.${flow}.media.${mediaKey}'`,
          })
          continue
        }

        const parsedRouteKey = parseUserRouteKey(
          routeKeyValue,
          `selectors.${flow}.media.${mediaKey}`,
          warnings
        )
        if (!parsedRouteKey) {
          continue
        }

        media[mediaKey as PromptRouteMedia] = parsedRouteKey
      }

      if (Object.keys(media).length > 0) {
        selector.media = media
      }
    }
  }

  if (Object.keys(selector).length === 0) {
    return null
  }

  return selector
}

const parseUserRouteDefinition = (
  routeKey: string,
  value: unknown,
  warnings: PromptRoutingWarning[]
): PromptRouteDefinition | null => {
  const validated = routeDefinitionSchema.safeParse(value)
  if (validated.success) {
    return cloneRouteDefinition(validated.data)
  }

  warnings.push({
    code: "invalid_user_mapping",
    message: `Skipping invalid user route '${routeKey}': ${formatZodIssuePath(validated.error.issues)}`,
  })
  return null
}

const parseUserMappingOverlay = (parsed: unknown): UserMappingOverlay => {
  const warnings: PromptRoutingWarning[] = []
  const overlay: UserMappingOverlay = {
    selectors: {},
    routes: {},
    warnings,
  }

  if (!isRecord(parsed)) {
    warnings.push({
      code: "invalid_user_mapping",
      message: "Skipping invalid user prompt mapping: root must be an object",
    })
    return overlay
  }

  for (const key of Object.keys(parsed)) {
    if (["version", "selectors", "routes"].includes(key)) {
      continue
    }

    warnings.push({
      code: "unknown_user_entry",
      message: `Skipping unknown user mapping entry '${key}'`,
    })
  }

  if (Object.prototype.hasOwnProperty.call(parsed, "version")) {
    const version = parsed.version
    if (version !== 1) {
      warnings.push({
        code: "invalid_user_mapping",
        message: `Skipping invalid user mapping entry 'version': expected 1, received '${String(version)}'`,
      })
    }
  }

  if (Object.prototype.hasOwnProperty.call(parsed, "selectors")) {
    const selectorsValue = parsed.selectors

    if (!isRecord(selectorsValue)) {
      warnings.push({
        code: "invalid_user_mapping",
        message: "Skipping invalid user mapping entry 'selectors': selectors must be an object",
      })
    } else {
      for (const [flow, flowValue] of Object.entries(selectorsValue)) {
        if (!PROMPT_ROUTE_FLOW_VALUES.includes(flow as PromptRouteFlow)) {
          warnings.push({
            code: "unknown_user_entry",
            message: `Skipping unknown user mapping entry 'selectors.${flow}'`,
          })
          continue
        }

        const parsedSelector = parseUserFlowSelectorOverride(flow, flowValue, warnings)
        if (!parsedSelector) {
          continue
        }

        overlay.selectors[flow as PromptRouteFlow] = parsedSelector
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(parsed, "routes")) {
    const routesValue = parsed.routes

    if (!isRecord(routesValue)) {
      warnings.push({
        code: "invalid_user_mapping",
        message: "Skipping invalid user mapping entry 'routes': routes must be an object",
      })
    } else {
      for (const [routeKeyRaw, routeValue] of Object.entries(routesValue)) {
        const routeKey = routeKeyRaw.trim()
        if (routeKey.length === 0) {
          warnings.push({
            code: "invalid_user_mapping",
            message:
              "Skipping invalid user mapping route key: route key must be a non-empty string",
          })
          continue
        }

        const parsedRoute = parseUserRouteDefinition(routeKey, routeValue, warnings)
        if (!parsedRoute) {
          continue
        }

        overlay.routes[routeKey] = parsedRoute
      }
    }
  }

  return overlay
}

const mergeMappingOverlay = (
  system: PromptRoutingMapping,
  user: UserMappingOverlay
): {
  effective: PromptRoutingMapping
  warnings: PromptRoutingWarning[]
} => {
  const warnings: PromptRoutingWarning[] = []
  const systemWatchdogRouteKeys = new Set<string>([system.selectors.watchdog.default])
  for (const media of PROMPT_ROUTE_MEDIA_VALUES) {
    const routeKey = system.selectors.watchdog.media[media]
    if (routeKey) {
      systemWatchdogRouteKeys.add(routeKey)
    }
  }

  const mergedRoutes: Record<string, PromptRouteDefinition> = Object.fromEntries(
    Object.entries(system.routes).map(([routeKey, route]) => {
      return [routeKey, cloneRouteDefinition(route)]
    })
  )

  for (const [routeKey, userRoute] of Object.entries(user.routes)) {
    if (systemWatchdogRouteKeys.has(routeKey)) {
      warnings.push({
        code: "watchdog_user_override_blocked",
        message: `Ignoring user route override '${routeKey}' for watchdog resolution`,
      })
      continue
    }

    const existingRoute = mergedRoutes[routeKey]
    if (!existingRoute) {
      mergedRoutes[routeKey] = cloneRouteDefinition(userRoute)
      continue
    }

    mergedRoutes[routeKey] = {
      layers: {
        ...existingRoute.layers,
        ...userRoute.layers,
      },
    }
  }

  const mergedSelectors: Record<PromptRouteFlow, PromptFlowSelector> = {
    interactive: {
      default: system.selectors.interactive.default,
      media: { ...system.selectors.interactive.media },
    },
    scheduled: {
      default: system.selectors.scheduled.default,
      media: { ...system.selectors.scheduled.media },
    },
    background: {
      default: system.selectors.background.default,
      media: { ...system.selectors.background.media },
    },
    watchdog: {
      default: system.selectors.watchdog.default,
      media: { ...system.selectors.watchdog.media },
    },
  }

  for (const flow of PROMPT_ROUTE_FLOW_VALUES) {
    const override = user.selectors[flow]
    if (!override) {
      continue
    }

    if (flow === "watchdog") {
      warnings.push({
        code: "watchdog_user_override_blocked",
        message:
          "Ignoring user mapping overrides for watchdog selectors; watchdog always resolves from system mapping",
      })
      continue
    }

    if (override.default) {
      mergedSelectors[flow].default = override.default
    }

    if (override.media) {
      mergedSelectors[flow].media = {
        ...mergedSelectors[flow].media,
        ...override.media,
      }
    }
  }

  for (const flow of PROMPT_ROUTE_FLOW_VALUES) {
    const selector = mergedSelectors[flow]
    const systemSelector = system.selectors[flow]

    if (!mergedRoutes[selector.default]) {
      warnings.push({
        code: "unknown_user_route",
        message: `Selector '${flow}.default' references unknown route '${selector.default}', falling back to system default '${systemSelector.default}'`,
      })
      selector.default = systemSelector.default
    }

    for (const media of PROMPT_ROUTE_MEDIA_VALUES) {
      const routeKey = selector.media[media]
      if (!routeKey) {
        continue
      }

      if (mergedRoutes[routeKey]) {
        continue
      }

      warnings.push({
        code: "unknown_user_route",
        message: `Selector '${flow}.media.${media}' references unknown route '${routeKey}', falling back to system selector`,
      })

      const systemRouteKey = systemSelector.media[media]
      if (systemRouteKey) {
        selector.media[media] = systemRouteKey
      } else {
        delete selector.media[media]
      }
    }
  }

  return {
    effective: {
      selectors: mergedSelectors,
      routes: mergedRoutes,
    },
    warnings,
  }
}

const resolveMediaForFlow = (
  flow: PromptRouteFlow,
  media: PromptRouteMedia | null | undefined
): PromptRouteMedia | null => {
  if (flow === "scheduled" || flow === "background") {
    return media ?? "cli"
  }

  if (flow === "watchdog") {
    return null
  }

  return media ?? null
}

const resolveRouteFromMapping = (
  mapping: PromptRoutingMapping,
  flow: PromptRouteFlow,
  media: PromptRouteMedia | null
): {
  routeKey: string
  route: PromptRouteDefinition
} => {
  const selector = mapping.selectors[flow]
  const preferredRouteKey = media ? selector.media[media] : undefined
  const selectedRouteKey = preferredRouteKey ?? selector.default
  const selectedRoute = mapping.routes[selectedRouteKey]

  if (selectedRoute) {
    return {
      routeKey: selectedRouteKey,
      route: selectedRoute,
    }
  }

  const fallbackRoute = mapping.routes[selector.default]
  if (!fallbackRoute) {
    throw new Error(
      `Prompt route resolution failed for flow '${flow}': default route '${selector.default}' was not found`
    )
  }

  return {
    routeKey: selector.default,
    route: fallbackRoute,
  }
}

const resolveUserMappingOverlay = async (
  filePath: string,
  logger?: Pick<Logger, "warn">
): Promise<UserMappingOverlay> => {
  let source: string

  try {
    source = await readFile(filePath, "utf8")
  } catch (error) {
    const fileError = error as NodeJS.ErrnoException
    if (fileError.code === "ENOENT") {
      return {
        selectors: {},
        routes: {},
        warnings: [],
      }
    }

    throw error
  }

  try {
    const parsed = parseJsoncContent(source, filePath)
    const overlay = parseUserMappingOverlay(parsed)

    for (const warning of overlay.warnings) {
      logger?.warn({ filePath, warningCode: warning.code }, warning.message)
    }

    return overlay
  } catch (error) {
    const err = error as Error
    const warning: PromptRoutingWarning = {
      code: "invalid_user_mapping",
      message: `Failed to parse user prompt mapping '${filePath}': ${err.message}`,
    }

    logger?.warn({ filePath, warningCode: warning.code }, warning.message)

    return {
      selectors: {},
      routes: {},
      warnings: [warning],
    }
  }
}

/**
 * Loads system and user prompt routing mappings and builds one deterministic effective mapping
 * so runtime prompt resolution can remain data-driven while tolerating invalid user overrides.
 *
 * @param input Runtime workspace root and optional logger for non-fatal user mapping warnings.
 * @returns Parsed system mapping, merged effective mapping, and warning diagnostics.
 */
export const loadPromptRoutingMapping = async (input: {
  ottoHome: string
  logger?: Pick<Logger, "warn">
}): Promise<PromptRoutingLoadResult> => {
  const { systemMappingPath, userMappingPath } = resolvePromptMappingPaths(input.ottoHome)

  const systemSource = await readFile(systemMappingPath, "utf8")
  const systemParsed = parseJsoncContent(systemSource, systemMappingPath)
  const system = parseSystemMapping(systemParsed, systemMappingPath)

  const userOverlay = await resolveUserMappingOverlay(userMappingPath, input.logger)
  const merged = mergeMappingOverlay(system, userOverlay)

  const warnings = [...userOverlay.warnings, ...merged.warnings]

  for (const warning of merged.warnings) {
    input.logger?.warn({ filePath: userMappingPath, warningCode: warning.code }, warning.message)
  }

  return {
    systemMappingPath,
    userMappingPath,
    system,
    effective: merged.effective,
    warnings,
  }
}

/**
 * Resolves prompt route metadata from preloaded mapping state for a runtime flow/media context
 * while enforcing system-only watchdog behavior.
 *
 * @param input Loaded mappings and route context.
 * @returns Deterministic resolved route key and layer references.
 */
export const resolvePromptRoute = (input: {
  mapping: PromptRoutingLoadResult
  context: ResolvePromptRouteContext
}): PromptRouteResolution => {
  const flow = input.context.flow
  const media = resolveMediaForFlow(flow, input.context.media)

  if (flow === "watchdog") {
    const resolved = resolveRouteFromMapping(input.mapping.system, flow, media)

    for (const [layer, reference] of Object.entries(resolved.route.layers)) {
      if (!reference || reference.source === "system") {
        continue
      }

      throw new Error(
        `Watchdog route '${resolved.routeKey}' is invalid: layer '${layer}' must use source 'system'`
      )
    }

    return {
      flow,
      media,
      routeKey: resolved.routeKey,
      route: cloneRouteDefinition(resolved.route),
      mappingSource: "system",
      warnings: input.mapping.warnings,
    }
  }

  const resolved = resolveRouteFromMapping(input.mapping.effective, flow, media)

  return {
    flow,
    media,
    routeKey: resolved.routeKey,
    route: cloneRouteDefinition(resolved.route),
    mappingSource: "effective",
    warnings: input.mapping.warnings,
  }
}

export { resolvePromptMappingPaths }
