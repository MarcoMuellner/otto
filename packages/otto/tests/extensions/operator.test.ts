import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import {
  createExtensionStateRepository,
  installExtension,
  listExtensions,
  removeExtension,
  updateAllExtensions,
  updateExtension,
} from "../../src/extensions/index.js"

const TEMP_PREFIX = path.join(tmpdir(), "otto-extension-operator-")
const cleanupPaths: string[] = []

afterEach(async () => {
  await Promise.all(
    cleanupPaths.splice(0).map(async (directory) => rm(directory, { recursive: true, force: true }))
  )
})

const writeCatalogExtension = async (
  catalogRoot: string,
  extensionId: string,
  version: string,
  description = "Example extension"
): Promise<void> => {
  const extensionRoot = path.join(catalogRoot, extensionId)
  await mkdir(path.join(extensionRoot, "skills"), { recursive: true })
  await writeFile(path.join(extensionRoot, "skills", `${extensionId}.md`), "# skill\n", "utf8")
  await writeFile(
    path.join(extensionRoot, "manifest.jsonc"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        id: extensionId,
        name: `${extensionId} extension`,
        version,
        description,
        payload: {
          skills: {
            path: "skills",
          },
        },
      },
      null,
      2
    )}\n`,
    "utf8"
  )
}

describe("extension operator service", () => {
  it("installs latest version and keeps command idempotent", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const catalogRoot = path.join(tempRoot, "catalog")
    const ottoHome = path.join(tempRoot, ".otto")
    await writeCatalogExtension(catalogRoot, "calendar", "1.2.0")

    // Act
    const first = await installExtension({ ottoHome, catalogRoot }, "calendar")
    const second = await installExtension({ ottoHome, catalogRoot }, "calendar")

    // Assert
    expect(first.installedVersion).toBe("1.2.0")
    expect(second.wasAlreadyInstalled).toBe(true)

    const skillPath = path.join(
      ottoHome,
      "extensions",
      "store",
      "calendar",
      "1.2.0",
      "skills",
      "calendar.md"
    )
    await expect(readFile(skillPath, "utf8")).resolves.toContain("skill")
  })

  it("updates extension to latest and prunes old store version", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const catalogRoot = path.join(tempRoot, "catalog")
    const ottoHome = path.join(tempRoot, ".otto")
    await writeCatalogExtension(catalogRoot, "calendar", "1.0.0")
    await installExtension({ ottoHome, catalogRoot }, "calendar")

    await writeCatalogExtension(catalogRoot, "calendar", "1.1.0")

    // Act
    const updated = await updateExtension({ ottoHome, catalogRoot }, "calendar")

    // Assert
    expect(updated.installedVersion).toBe("1.1.0")
    expect(updated.prunedVersions).toEqual(["1.0.0"])

    await expect(
      readFile(
        path.join(ottoHome, "extensions", "store", "calendar", "1.1.0", "manifest.jsonc"),
        "utf8"
      )
    ).resolves.toContain("1.1.0")

    const repository = createExtensionStateRepository(ottoHome)
    const installed = await repository.listInstalledExtensions()
    expect(installed).toEqual([
      {
        id: "calendar",
        installedVersions: ["1.1.0"],
        activeVersion: null,
        installedAtByVersion: {
          "1.1.0": expect.any(Number),
        },
        updatedAt: expect.any(Number),
      },
    ])
  })

  it("updates all installed extension ids", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const catalogRoot = path.join(tempRoot, "catalog")
    const ottoHome = path.join(tempRoot, ".otto")

    await writeCatalogExtension(catalogRoot, "calendar", "1.0.0")
    await writeCatalogExtension(catalogRoot, "notes", "1.0.0")
    await installExtension({ ottoHome, catalogRoot }, "calendar")
    await installExtension({ ottoHome, catalogRoot }, "notes")

    await writeCatalogExtension(catalogRoot, "calendar", "1.1.0")
    await writeCatalogExtension(catalogRoot, "notes", "1.2.0")

    // Act
    const updates = await updateAllExtensions({ ottoHome, catalogRoot })

    // Assert
    expect(updates).toHaveLength(2)
    expect(updates.map((update) => `${update.id}@${update.installedVersion}`)).toEqual([
      "calendar@1.1.0",
      "notes@1.2.0",
    ])
  })

  it("removes installed version and denies removing active versions", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const catalogRoot = path.join(tempRoot, "catalog")
    const ottoHome = path.join(tempRoot, ".otto")
    await writeCatalogExtension(catalogRoot, "calendar", "1.0.0")
    await installExtension({ ottoHome, catalogRoot }, "calendar")

    const repository = createExtensionStateRepository(ottoHome)
    await repository.setActiveVersion("calendar", "1.0.0")

    // Act + Assert
    await expect(removeExtension({ ottoHome, catalogRoot }, "calendar")).rejects.toThrow(
      "Cannot remove active extension"
    )

    await repository.setActiveVersion("calendar", null)
    const removed = await removeExtension({ ottoHome, catalogRoot }, "calendar")
    expect(removed).toEqual({ id: "calendar", removedVersion: "1.0.0" })
  })

  it("lists catalog and installed update availability", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const catalogRoot = path.join(tempRoot, "catalog")
    const ottoHome = path.join(tempRoot, ".otto")
    await writeCatalogExtension(catalogRoot, "calendar", "1.0.0")
    await installExtension({ ottoHome, catalogRoot }, "calendar")
    await writeCatalogExtension(catalogRoot, "calendar", "1.1.0")

    // Act
    const summary = await listExtensions({ ottoHome, catalogRoot })

    // Assert
    expect(summary.catalog[0]?.latestVersion).toBe("1.1.0")
    expect(summary.installed[0]?.version).toBe("1.0.0")
    expect(summary.installed[0]?.upToDate).toBe(false)
  })
})
