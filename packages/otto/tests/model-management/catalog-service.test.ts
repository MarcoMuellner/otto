import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"

import { createModelCatalogService } from "../../src/model-management/catalog-service.js"

const TEMP_PREFIX = path.join(tmpdir(), "otto-model-catalog-")
const cleanupPaths: string[] = []

afterEach(async () => {
  await Promise.all(
    cleanupPaths.splice(0).map(async (directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe("createModelCatalogService", () => {
  it("fails startup when initial network fetch fails", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const service = createModelCatalogService({
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
      },
      ottoHome: tempRoot,
      fetchCatalogRefs: async () => {
        throw new Error("upstream unavailable")
      },
    })

    // Act / Assert
    await expect(service.ensureInitialFetch()).rejects.toThrow("upstream unavailable")
  })

  it("persists fetched model refs to cache file", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const service = createModelCatalogService({
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
      },
      ottoHome: tempRoot,
      fetchCatalogRefs: async () => ["openai/gpt-5.3-codex", "anthropic/claude-sonnet-4"],
      now: () => 1_234,
    })

    // Act
    await service.ensureInitialFetch()
    const cache = await readFile(path.join(tempRoot, "data", "model-catalog-cache.json"), "utf8")

    // Assert
    expect(JSON.parse(cache)).toEqual({
      refs: ["openai/gpt-5.3-codex", "anthropic/claude-sonnet-4"],
      updatedAt: 1_234,
    })
  })

  it("keeps previous cache snapshot when periodic refresh fails", async () => {
    // Arrange
    vi.useFakeTimers()
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
    }
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    let fetchCount = 0
    const service = createModelCatalogService({
      logger,
      ottoHome: tempRoot,
      fetchCatalogRefs: async () => {
        fetchCount += 1
        if (fetchCount === 1) {
          return ["openai/gpt-5.3-codex"]
        }

        throw new Error("refresh failed")
      },
      now: () => 2_000,
      refreshIntervalMs: 10,
    })
    await service.ensureInitialFetch()

    // Act
    service.startPeriodicRefresh()
    await vi.advanceTimersByTimeAsync(15)

    // Assert
    expect(service.getSnapshot()).toEqual({
      refs: ["openai/gpt-5.3-codex"],
      updatedAt: 2_000,
      source: "network",
    })
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ error: "refresh failed" }),
      "Model catalog refresh failed; keeping previous cache snapshot"
    )

    service.stopPeriodicRefresh()
    vi.useRealTimers()
  })
})
