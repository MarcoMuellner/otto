import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import {
  createExtensionStateRepository,
  ensureExtensionPersistenceDirectories,
  resolveExtensionPersistencePaths,
} from "../../src/extensions/index.js"

const TEMP_PREFIX = path.join(tmpdir(), "otto-extension-state-")
const cleanupPaths: string[] = []

afterEach(async () => {
  await Promise.all(
    cleanupPaths.splice(0).map(async (directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe("extension persistence directories", () => {
  it("creates extension root and store directories", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const ottoHome = path.join(tempRoot, ".otto")

    // Act
    const created = await ensureExtensionPersistenceDirectories(ottoHome)

    // Assert
    expect(created).toEqual([
      path.join(ottoHome, "extensions"),
      path.join(ottoHome, "extensions", "store"),
    ])
  })
})

describe("extension state repository", () => {
  it("records multiple versions and persists state across reload", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const ottoHome = path.join(tempRoot, ".otto")
    const repository = createExtensionStateRepository(ottoHome)

    // Act
    await repository.recordInstalledVersion("calendar", "1.0.0", 100)
    await repository.recordInstalledVersion("calendar", "1.1.0", 200)

    const reloadedRepository = createExtensionStateRepository(ottoHome)
    const installed = await reloadedRepository.listInstalledExtensions()

    // Assert
    expect(installed).toEqual([
      {
        id: "calendar",
        installedVersions: ["1.0.0", "1.1.0"],
        activeVersion: null,
        installedAtByVersion: {
          "1.0.0": 100,
          "1.1.0": 200,
        },
        updatedAt: 200,
      },
    ])
  })

  it("sets active version and lists enabled extensions", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const ottoHome = path.join(tempRoot, ".otto")
    const repository = createExtensionStateRepository(ottoHome)

    await repository.recordInstalledVersion("calendar", "1.0.0", 100)

    // Act
    await repository.setActiveVersion("calendar", "1.0.0", 150)
    const enabled = await repository.listEnabledExtensions()

    // Assert
    expect(enabled).toEqual([
      {
        id: "calendar",
        installedVersions: ["1.0.0"],
        activeVersion: "1.0.0",
        installedAtByVersion: {
          "1.0.0": 100,
        },
        updatedAt: 150,
      },
    ])
  })

  it("denies removing the currently active version", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const ottoHome = path.join(tempRoot, ".otto")
    const repository = createExtensionStateRepository(ottoHome)

    await repository.recordInstalledVersion("calendar", "1.0.0", 100)
    await repository.setActiveVersion("calendar", "1.0.0", 120)

    // Act
    const guard = await repository.canRemoveVersion("calendar", "1.0.0")
    const removeCall = repository.removeInstalledVersion("calendar", "1.0.0", 130)

    // Assert
    expect(guard).toEqual({
      allowed: false,
      reason: "active_version",
    })
    await expect(removeCall).rejects.toMatchObject({
      code: "extension.version_active",
    })
  })

  it("removes non-active versions and deletes empty extension entries", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const ottoHome = path.join(tempRoot, ".otto")
    const repository = createExtensionStateRepository(ottoHome)

    await repository.recordInstalledVersion("calendar", "1.0.0", 100)
    await repository.recordInstalledVersion("calendar", "1.1.0", 110)
    await repository.setActiveVersion("calendar", "1.1.0", 120)

    // Act
    const updated = await repository.removeInstalledVersion("calendar", "1.0.0", 130)
    await repository.setActiveVersion("calendar", null, 140)
    const removed = await repository.removeInstalledVersion("calendar", "1.1.0", 150)
    const installed = await repository.listInstalledExtensions()

    // Assert
    expect(updated).toEqual({
      id: "calendar",
      installedVersions: ["1.1.0"],
      activeVersion: "1.1.0",
      installedAtByVersion: {
        "1.1.0": 110,
      },
      updatedAt: 130,
    })
    expect(removed).toBeNull()
    expect(installed).toEqual([])
  })

  it("writes deterministic state file under otto home", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const ottoHome = path.join(tempRoot, ".otto")
    const repository = createExtensionStateRepository(ottoHome)
    const persistencePaths = resolveExtensionPersistencePaths(ottoHome)

    // Act
    await repository.recordInstalledVersion("calendar", "1.0.0", 100)
    const source = await readFile(persistencePaths.stateFilePath, "utf8")
    const parsed = JSON.parse(source) as {
      version: number
      extensions: Record<string, { installedVersions: string[] }>
    }

    // Assert
    expect(parsed.version).toBe(1)
    expect(parsed.extensions.calendar?.installedVersions).toEqual(["1.0.0"])
  })
})
