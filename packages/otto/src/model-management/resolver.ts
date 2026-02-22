import type { Logger } from "pino"

import type { OttoConfig } from "../config/otto-config.js"
import { splitModelRef } from "./model-ref.js"
import type {
  ModelCatalogSnapshot,
  ModelSelectionSource,
  ResolvedRuntimeModel,
  RuntimeModelFlow,
} from "./types.js"

type RuntimeModelResolverDependencies = {
  logger: Pick<Logger, "warn">
  getCatalogSnapshot: () => ModelCatalogSnapshot
  fetchGlobalDefaultModelRef: () => Promise<string>
  loadOttoConfig: () => Promise<OttoConfig>
}

type ResolutionInput = {
  flow: RuntimeModelFlow
  jobModelRef: string | null
}

const resolveFlowDefaultModelRef = (config: OttoConfig, flow: RuntimeModelFlow): string | null => {
  return config.modelManagement.flowDefaults[flow]
}

/**
 * Builds deterministic runtime model resolution with fallback behavior so assistant and
 * scheduler paths share one precedence contract.
 *
 * @param dependencies Live config/catalog/default model dependencies.
 * @returns Model resolver used by OpenCode prompt paths.
 */
export const createRuntimeModelResolver = (dependencies: RuntimeModelResolverDependencies) => {
  const resolveCandidate = async (
    input: ResolutionInput
  ): Promise<
    | {
        modelRef: string
        source: Exclude<ModelSelectionSource, "fallback_global_default" | "global_default">
      }
    | null
  > => {
    if (input.jobModelRef) {
      return {
        modelRef: input.jobModelRef,
        source: "job",
      }
    }

    const config = await dependencies.loadOttoConfig()
    const flowDefault = resolveFlowDefaultModelRef(config, input.flow)
    if (flowDefault) {
      return {
        modelRef: flowDefault,
        source: "flow_default",
      }
    }

    return null
  }

  return {
    resolve: async (input: ResolutionInput): Promise<ResolvedRuntimeModel> => {
      const selected = await resolveCandidate(input)
      const catalogSnapshot = dependencies.getCatalogSnapshot()
      const catalogRefs = new Set(catalogSnapshot.refs)

      if (!selected) {
        const globalDefaultModelRef = await dependencies.fetchGlobalDefaultModelRef()
        if (!catalogRefs.has(globalDefaultModelRef)) {
          throw new Error(
            `Resolved model ${globalDefaultModelRef} is unavailable and no valid fallback could be applied`
          )
        }

        const split = splitModelRef(globalDefaultModelRef)
        return {
          providerId: split.providerId,
          modelId: split.modelId,
          source: "global_default",
        }
      }

      const selectedIsAvailable = catalogRefs.has(selected.modelRef)
      if (selectedIsAvailable) {
        const split = splitModelRef(selected.modelRef)
        return {
          providerId: split.providerId,
          modelId: split.modelId,
          source: selected.source,
        }
      }

      const globalDefaultModelRef = await dependencies.fetchGlobalDefaultModelRef()

      dependencies.logger.warn(
        {
          flow: input.flow,
          requestedModelRef: selected.modelRef,
          fallbackModelRef: globalDefaultModelRef,
          catalogUpdatedAt: catalogSnapshot.updatedAt,
          catalogSource: catalogSnapshot.source,
        },
        "Selected model is unavailable; falling back to OpenCode global default"
      )

      if (!catalogRefs.has(globalDefaultModelRef)) {
        throw new Error(
          `Resolved model ${globalDefaultModelRef} is unavailable and no valid fallback could be applied`
        )
      }

      const split = splitModelRef(globalDefaultModelRef)
      return {
        providerId: split.providerId,
        modelId: split.modelId,
        source: "fallback_global_default",
      }
    },
  }
}
