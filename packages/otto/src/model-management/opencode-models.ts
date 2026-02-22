import { createOpencodeClient } from "@opencode-ai/sdk"

import { splitModelRef } from "./model-ref.js"

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Wraps OpenCode SDK model endpoints to keep runtime model-management concerns isolated from
 * transport details and resilient to payload-shape drift.
 *
 * @param baseUrl OpenCode server base URL.
 * @returns Fetch helpers for global default model and provider/model catalog refs.
 */
export const createOpencodeModelClient = (baseUrl: string) => {
  const client = createOpencodeClient({ baseUrl, throwOnError: true })

  return {
    fetchGlobalDefaultModelRef: async (): Promise<string> => {
      const response = await client.config.get()
      const modelRef = response.data?.model

      if (typeof modelRef !== "string" || modelRef.trim().length === 0) {
        throw new Error("OpenCode config is missing a default model")
      }

      splitModelRef(modelRef)
      return modelRef
    },
    fetchCatalogRefs: async (): Promise<string[]> => {
      const response = await client.config.providers()
      const providers = response.data?.providers

      if (!Array.isArray(providers)) {
        throw new Error("OpenCode provider catalog response is missing providers")
      }

      const refs = new Set<string>()
      for (const provider of providers) {
        if (!isRecord(provider)) {
          continue
        }

        const providerId = provider.id
        const models = provider.models
        if (typeof providerId !== "string" || providerId.trim().length === 0 || !isRecord(models)) {
          continue
        }

        for (const modelId of Object.keys(models)) {
          if (modelId.trim().length === 0) {
            continue
          }

          refs.add(`${providerId}/${modelId}`)
        }
      }

      return [...refs].sort((left, right) => left.localeCompare(right))
    },
  }
}
