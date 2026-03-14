import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import {
  createExtensionStateRepository,
  disableExtension,
  installExtension,
  listExtensions,
  removeExtension,
  updateAllExtensions,
  updateExtension,
} from "../../src/extensions/index.js"
import { createRegistryHarness, type RegistryHarness } from "./registry-harness.js"

const TEMP_PREFIX = path.join(tmpdir(), "otto-extension-operator-")
const cleanupPaths: string[] = []
const cleanupHarnesses: RegistryHarness[] = []

afterEach(async () => {
  await Promise.all(cleanupHarnesses.splice(0).map(async (harness) => harness.close()))
  await Promise.all(
    cleanupPaths.splice(0).map(async (directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe("extension operator service", () => {
  it("installs latest version, activates runtime footprint, and keeps command idempotent", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const harness = await createRegistryHarness(tempRoot)
    cleanupHarnesses.push(harness)

    const ottoHome = path.join(tempRoot, ".otto")
    await harness.publishExtensionVersion("calendar", "1.2.0")

    // Act
    const first = await installExtension({ ottoHome, registryUrl: harness.registryUrl }, "calendar")
    const second = await installExtension(
      { ottoHome, registryUrl: harness.registryUrl },
      "calendar"
    )

    // Assert
    expect(first.installedVersion).toBe("1.2.0")
    expect(second.wasAlreadyInstalled).toBe(true)

    await expect(
      readFile(
        path.join(
          ottoHome,
          "extensions",
          "store",
          "calendar",
          "1.2.0",
          "skills",
          "calendar-skill",
          "SKILL.md"
        ),
        "utf8"
      )
    ).resolves.toContain("skill")
    await expect(
      readFile(
        path.join(ottoHome, ".opencode", "tools", "extensions", "calendar", "calendar.ts"),
        "utf8"
      )
    ).resolves.toContain("export default")
    await expect(
      readFile(path.join(ottoHome, ".opencode", "tools", "calendar.ts"), "utf8")
    ).resolves.toContain("export default")
    await expect(
      readFile(path.join(ottoHome, ".opencode", "skills", "calendar-skill", "SKILL.md"), "utf8")
    ).resolves.toContain("skill")
  })

  it("updates extension to latest and prunes old store version", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const harness = await createRegistryHarness(tempRoot)
    cleanupHarnesses.push(harness)

    const ottoHome = path.join(tempRoot, ".otto")
    await harness.publishExtensionVersion("calendar", "1.0.0")
    await installExtension({ ottoHome, registryUrl: harness.registryUrl }, "calendar")
    await harness.publishExtensionVersion("calendar", "1.1.0")

    // Act
    const updated = await updateExtension(
      { ottoHome, registryUrl: harness.registryUrl },
      "calendar"
    )

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
        activeVersion: "1.1.0",
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
    const harness = await createRegistryHarness(tempRoot)
    cleanupHarnesses.push(harness)

    const ottoHome = path.join(tempRoot, ".otto")
    await harness.publishExtensionVersion("calendar", "1.0.0")
    await harness.publishExtensionVersion("notes", "1.0.0")
    await installExtension({ ottoHome, registryUrl: harness.registryUrl }, "calendar")
    await installExtension({ ottoHome, registryUrl: harness.registryUrl }, "notes")

    await harness.publishExtensionVersion("calendar", "1.1.0")
    await harness.publishExtensionVersion("notes", "1.2.0")

    // Act
    const updates = await updateAllExtensions({ ottoHome, registryUrl: harness.registryUrl })

    // Assert
    expect(updates).toHaveLength(2)
    expect(updates.map((update) => `${update.id}@${update.installedVersion}`)).toEqual([
      "calendar@1.1.0",
      "notes@1.2.0",
    ])
  })

  it("disables installed extension by removing runtime and store footprint", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const harness = await createRegistryHarness(tempRoot)
    cleanupHarnesses.push(harness)

    const ottoHome = path.join(tempRoot, ".otto")
    await harness.publishExtensionVersion("calendar", "1.0.0")
    await installExtension({ ottoHome, registryUrl: harness.registryUrl }, "calendar")

    // Act
    const removed = await disableExtension(
      { ottoHome, registryUrl: harness.registryUrl },
      "calendar"
    )

    // Assert
    expect(removed).toEqual({ id: "calendar", removedVersion: "1.0.0" })
    await expect(
      readFile(
        path.join(ottoHome, ".opencode", "tools", "extensions", "calendar", "calendar.ts"),
        "utf8"
      )
    ).rejects.toMatchObject({ code: "ENOENT" })
    await expect(
      readFile(path.join(ottoHome, ".opencode", "tools", "calendar.ts"), "utf8")
    ).rejects.toMatchObject({
      code: "ENOENT",
    })
    await expect(
      readFile(
        path.join(ottoHome, "extensions", "store", "calendar", "1.0.0", "manifest.jsonc"),
        "utf8"
      )
    ).rejects.toMatchObject({ code: "ENOENT" })
  })

  it("remove remains an uninstall alias", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const harness = await createRegistryHarness(tempRoot)
    cleanupHarnesses.push(harness)

    const ottoHome = path.join(tempRoot, ".otto")
    await harness.publishExtensionVersion("calendar", "1.0.0")
    await installExtension({ ottoHome, registryUrl: harness.registryUrl }, "calendar")

    // Act
    const removed = await removeExtension(
      { ottoHome, registryUrl: harness.registryUrl },
      "calendar"
    )

    // Assert
    expect(removed).toEqual({ id: "calendar", removedVersion: "1.0.0" })
  })

  it("lists registry and installed update availability", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const harness = await createRegistryHarness(tempRoot)
    cleanupHarnesses.push(harness)

    const ottoHome = path.join(tempRoot, ".otto")
    await harness.publishExtensionVersion("calendar", "1.0.0")
    await installExtension({ ottoHome, registryUrl: harness.registryUrl }, "calendar")
    await harness.publishExtensionVersion("calendar", "1.1.0")

    // Act
    const summary = await listExtensions({ ottoHome, registryUrl: harness.registryUrl })

    // Assert
    expect(summary.catalog[0]?.latestVersion).toBe("1.1.0")
    expect(summary.installed[0]?.version).toBe("1.0.0")
    expect(summary.installed[0]?.upToDate).toBe(false)
  })

  it("generates aggregated .opencode/package.json from extension tool package manifests", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const harness = await createRegistryHarness(tempRoot)
    cleanupHarnesses.push(harness)

    const ottoHome = path.join(tempRoot, ".otto")
    await harness.publishExtensionVersion("calendar", "1.0.0", {
      toolDependencies: {
        anylist: "^0.8.5",
        "@opencode-ai/plugin": "1.2.15",
      },
    })

    // Act
    await installExtension({ ottoHome, registryUrl: harness.registryUrl }, "calendar")

    // Assert
    await expect(
      readFile(path.join(ottoHome, ".opencode", "package.json"), "utf8")
    ).resolves.toContain('"anylist": "^0.8.5"')
    await expect(
      readFile(path.join(ottoHome, ".opencode", "package.json"), "utf8")
    ).resolves.toContain('"better-sqlite3": "^11.8.1"')
    await expect(
      readFile(path.join(ottoHome, ".opencode", "package.json"), "utf8")
    ).resolves.toContain('"@opencode-ai/plugin": "1.2.20"')
  })

  it("runs install hook only on first install", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const harness = await createRegistryHarness(tempRoot)
    cleanupHarnesses.push(harness)

    const ottoHome = path.join(tempRoot, ".otto")
    await harness.publishExtensionVersion("calendar", "1.0.0", {
      hooks: {
        install: {
          all: "scripts/install.sh",
        },
        scripts: {
          "scripts/install.sh": [
            "#!/usr/bin/env bash",
            "set -e",
            'mkdir -p "$OTTO_HOME/markers"',
            'printf "%s\\n" "$OTTO_EXTENSION_VERSION" >> "$OTTO_HOME/markers/install.log"',
          ].join("\n"),
        },
      },
    })

    // Act
    const first = await installExtension({ ottoHome, registryUrl: harness.registryUrl }, "calendar")
    const second = await installExtension(
      { ottoHome, registryUrl: harness.registryUrl },
      "calendar"
    )

    // Assert
    expect(first.hookWarnings).toEqual([])
    expect(second.hookWarnings).toEqual([])
    await expect(readFile(path.join(ottoHome, "markers", "install.log"), "utf8")).resolves.toBe(
      "1.0.0\n"
    )
  })

  it("runs update hook when extension version changes", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const harness = await createRegistryHarness(tempRoot)
    cleanupHarnesses.push(harness)

    const ottoHome = path.join(tempRoot, ".otto")
    await harness.publishExtensionVersion("calendar", "1.0.0")
    await installExtension({ ottoHome, registryUrl: harness.registryUrl }, "calendar")
    await harness.publishExtensionVersion("calendar", "1.1.0", {
      hooks: {
        update: {
          all: "scripts/update.sh",
        },
        scripts: {
          "scripts/update.sh": [
            "#!/usr/bin/env bash",
            "set -e",
            'mkdir -p "$OTTO_HOME/markers"',
            'printf "%s->%s\\n" "$OTTO_EXTENSION_PREVIOUS_VERSION" "$OTTO_EXTENSION_VERSION" >> "$OTTO_HOME/markers/update.log"',
          ].join("\n"),
        },
      },
    })

    // Act
    const updated = await updateExtension(
      { ottoHome, registryUrl: harness.registryUrl },
      "calendar"
    )

    // Assert
    expect(updated.hookWarnings).toEqual([])
    await expect(readFile(path.join(ottoHome, "markers", "update.log"), "utf8")).resolves.toBe(
      "1.0.0->1.1.0\n"
    )
  })

  it("soft-fails hook errors and continues install/update", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const harness = await createRegistryHarness(tempRoot)
    cleanupHarnesses.push(harness)

    const ottoHome = path.join(tempRoot, ".otto")
    await harness.publishExtensionVersion("calendar", "1.0.0")
    await installExtension({ ottoHome, registryUrl: harness.registryUrl }, "calendar")
    await harness.publishExtensionVersion("calendar", "1.1.0", {
      hooks: {
        update: {
          all: "scripts/update.sh",
        },
        scripts: {
          "scripts/update.sh": [
            "#!/usr/bin/env bash",
            'echo "intentional failure" >&2',
            "exit 3",
          ].join("\n"),
        },
      },
    })

    // Act
    const updated = await updateExtension(
      { ottoHome, registryUrl: harness.registryUrl },
      "calendar"
    )

    // Assert
    expect(updated.installedVersion).toBe("1.1.0")
    expect(updated.hookWarnings).toHaveLength(1)
    expect(updated.hookWarnings[0]).toMatchObject({
      hook: "update",
      scriptPath: expect.stringContaining("scripts/update.sh"),
      reason: expect.stringContaining("intentional failure"),
    })

    const repository = createExtensionStateRepository(ottoHome)
    const installed = await repository.listInstalledExtensions()
    expect(installed[0]?.activeVersion).toBe("1.1.0")
  })

  it("soft-fails invalid hook paths and still updates extension", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const harness = await createRegistryHarness(tempRoot)
    cleanupHarnesses.push(harness)

    const ottoHome = path.join(tempRoot, ".otto")
    await harness.publishExtensionVersion("calendar", "1.0.0")
    await installExtension({ ottoHome, registryUrl: harness.registryUrl }, "calendar")
    await harness.publishExtensionVersion("calendar", "1.1.0", {
      hooks: {
        update: {
          all: "../../outside.sh",
        },
      },
    })

    // Act
    const updated = await updateExtension(
      { ottoHome, registryUrl: harness.registryUrl },
      "calendar"
    )

    // Assert
    expect(updated.installedVersion).toBe("1.1.0")
    expect(updated.hookWarnings).toHaveLength(1)
    expect(updated.hookWarnings[0]).toMatchObject({
      hook: "update",
      scriptPath: "<invalid-hook-path>",
      reason: expect.stringContaining("path escapes extension directory"),
    })

    const repository = createExtensionStateRepository(ottoHome)
    const installed = await repository.listInstalledExtensions()
    expect(installed[0]?.activeVersion).toBe("1.1.0")
  })
})
