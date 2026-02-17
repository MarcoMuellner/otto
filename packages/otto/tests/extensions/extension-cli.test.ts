import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import { runExtensionCliCommand } from "../../src/extension-cli.js"

const TEMP_PREFIX = path.join(tmpdir(), "otto-extension-cli-")
const cleanupPaths: string[] = []

afterEach(async () => {
  await Promise.all(
    cleanupPaths.splice(0).map(async (directory) => rm(directory, { recursive: true, force: true }))
  )
})

const writeCatalogExtension = async (
  catalogRoot: string,
  extensionId: string,
  version: string
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
        description: "Example",
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

describe("extension cli", () => {
  it("supports install, update --all, list, and remove", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)

    const ottoHome = path.join(tempRoot, ".otto")
    const catalogRoot = path.join(tempRoot, "catalog")
    await writeCatalogExtension(catalogRoot, "calendar", "1.0.0")
    await writeCatalogExtension(catalogRoot, "notes", "1.0.0")

    const outputs: string[] = []
    const errors: string[] = []
    const streams = {
      stdout: {
        log: (value?: unknown) => outputs.push(String(value ?? "")),
      },
      stderr: {
        error: (value?: unknown) => errors.push(String(value ?? "")),
      },
    }

    const env = {
      OTTO_HOME: ottoHome,
      OTTO_EXTENSION_CATALOG_ROOT: catalogRoot,
    }

    // Act
    const installCode = await runExtensionCliCommand(["install", "calendar"], streams, env)
    await writeCatalogExtension(catalogRoot, "calendar", "1.1.0")
    await runExtensionCliCommand(["install", "notes"], streams, env)
    const updateAllCode = await runExtensionCliCommand(["update", "--all"], streams, env)
    const listCode = await runExtensionCliCommand(["list"], streams, env)
    const removeCode = await runExtensionCliCommand(["remove", "notes"], streams, env)

    // Assert
    expect(installCode).toBe(0)
    expect(updateAllCode).toBe(0)
    expect(listCode).toBe(0)
    expect(removeCode).toBe(0)
    expect(errors).toEqual([])
    expect(outputs.join("\n")).toContain("Installed calendar@1.0.0")
    expect(outputs.join("\n")).toContain("Updated calendar@1.1.0")
    expect(outputs.join("\n")).toContain("Removed notes@1.0.0")
  })

  it("returns error code for unknown command", async () => {
    // Arrange
    const outputs: string[] = []
    const errors: string[] = []

    // Act
    const exitCode = await runExtensionCliCommand(
      ["unknown"],
      {
        stdout: { log: (value?: unknown) => outputs.push(String(value ?? "")) },
        stderr: { error: (value?: unknown) => errors.push(String(value ?? "")) },
      },
      {}
    )

    // Assert
    expect(exitCode).toBe(1)
    expect(errors[0]).toContain("Unknown extension command")
  })
})
