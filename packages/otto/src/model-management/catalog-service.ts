import path from "node:path"
import { mkdir, readFile, writeFile } from "node:fs/promises"

import type { Logger } from "pino"
import { z } from "zod"

import type { ModelCatalogSnapshot } from "./types.js"

const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000

const cacheSchema = z.object({
  updatedAt: z.number().int().nullable(),
  refs: z.array(z.string().min(1)),
})

type CatalogServiceDependencies = {
  logger: Pick<Logger, "info" | "warn">
  ottoHome: string
  fetchCatalogRefs: () => Promise<string[]>
  now?: () => number
  refreshIntervalMs?: number
}

export type ModelCatalogService = {
  ensureInitialFetch: () => Promise<void>
  refreshNow: () => Promise<ModelCatalogSnapshot>
  getSnapshot: () => ModelCatalogSnapshot
  startPeriodicRefresh: () => void
  stopPeriodicRefresh: () => void
}

const resolveCachePath = (ottoHome: string): string => {
  return path.join(ottoHome, "data", "model-catalog-cache.json")
}

/**
 * Creates a runtime catalog service with durable cache semantics so model availability checks
 * stay deterministic across restarts and intermittent upstream failures.
 *
 * @param dependencies Runtime logger, fetch adapter, and filesystem roots.
 * @returns Catalog lifecycle service used by startup and execution-time resolution.
 */
export const createModelCatalogService = (
  dependencies: CatalogServiceDependencies
): ModelCatalogService => {
  const now = dependencies.now ?? Date.now
  const refreshIntervalMs = dependencies.refreshIntervalMs ?? REFRESH_INTERVAL_MS
  const cachePath = resolveCachePath(dependencies.ottoHome)

  let timer: NodeJS.Timeout | null = null
  let snapshot: ModelCatalogSnapshot = {
    refs: [],
    updatedAt: null,
    source: "cache",
  }

  const saveCache = async (refs: string[], updatedAt: number): Promise<void> => {
    await mkdir(path.dirname(cachePath), { recursive: true })
    await writeFile(cachePath, `${JSON.stringify({ refs, updatedAt }, null, 2)}\n`, "utf8")
  }

  const loadCacheIfAvailable = async (): Promise<void> => {
    try {
      const source = await readFile(cachePath, "utf8")
      const parsed = JSON.parse(source)
      const validated = cacheSchema.safeParse(parsed)
      if (!validated.success) {
        dependencies.logger.warn(
          { cachePath },
          "Model catalog cache is invalid; ignoring cached data"
        )
        return
      }

      snapshot = {
        refs: validated.data.refs,
        updatedAt: validated.data.updatedAt,
        source: "cache",
      }
    } catch (error) {
      const errnoError = error as NodeJS.ErrnoException
      if (errnoError.code !== "ENOENT") {
        dependencies.logger.warn(
          { cachePath, error: errnoError.message },
          "Failed to read model catalog cache; continuing without cache"
        )
      }
    }
  }

  const fetchAndPersist = async (): Promise<ModelCatalogSnapshot> => {
    const refs = await dependencies.fetchCatalogRefs()
    const updatedAt = now()
    await saveCache(refs, updatedAt)
    snapshot = {
      refs,
      updatedAt,
      source: "network",
    }

    return snapshot
  }

  const refreshWithFallback = async (): Promise<void> => {
    try {
      await fetchAndPersist()
    } catch (error) {
      const err = error as Error
      dependencies.logger.warn(
        {
          error: err.message,
          updatedAt: snapshot.updatedAt,
          cachedModelCount: snapshot.refs.length,
        },
        "Model catalog refresh failed; keeping previous cache snapshot"
      )
    }
  }

  return {
    ensureInitialFetch: async (): Promise<void> => {
      await loadCacheIfAvailable()
      await fetchAndPersist()
    },
    refreshNow: async (): Promise<ModelCatalogSnapshot> => {
      return await fetchAndPersist()
    },
    getSnapshot: (): ModelCatalogSnapshot => {
      return {
        refs: [...snapshot.refs],
        updatedAt: snapshot.updatedAt,
        source: snapshot.source,
      }
    },
    startPeriodicRefresh: (): void => {
      if (timer) {
        return
      }

      timer = setInterval(() => {
        void refreshWithFallback()
      }, refreshIntervalMs)

      dependencies.logger.info(
        { refreshIntervalMs, cachePath },
        "Model catalog periodic refresh started"
      )
    },
    stopPeriodicRefresh: (): void => {
      if (!timer) {
        return
      }

      clearInterval(timer)
      timer = null
      dependencies.logger.info("Model catalog periodic refresh stopped")
    },
  }
}
