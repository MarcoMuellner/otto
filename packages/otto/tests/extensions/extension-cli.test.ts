import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import { runExtensionCliCommand } from "../../src/extension-cli.js"
import { createRegistryHarness, type RegistryHarness } from "./registry-harness.js"

const TEMP_PREFIX = path.join(tmpdir(), "otto-extension-cli-")
const cleanupPaths: string[] = []
const cleanupHarnesses: RegistryHarness[] = []

afterEach(async () => {
  await Promise.all(cleanupHarnesses.splice(0).map(async (harness) => harness.close()))
  await Promise.all(
    cleanupPaths.splice(0).map(async (directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe("extension cli", () => {
  it("supports install, update --all, list, and disable", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)

    const ottoHome = path.join(tempRoot, ".otto")
    const harness = await createRegistryHarness(tempRoot)
    cleanupHarnesses.push(harness)
    await harness.publishExtensionVersion("calendar", "1.0.0")
    await harness.publishExtensionVersion("notes", "1.0.0")

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
      OTTO_EXTENSION_REGISTRY_URL: harness.registryUrl,
    }

    // Act
    const installCode = await runExtensionCliCommand(["install", "calendar"], streams, env)
    await harness.publishExtensionVersion("calendar", "1.1.0")
    await runExtensionCliCommand(["install", "notes"], streams, env)
    const updateAllCode = await runExtensionCliCommand(["update", "--all"], streams, env)
    const listCode = await runExtensionCliCommand(["list"], streams, env)
    const disableCode = await runExtensionCliCommand(["disable", "notes"], streams, env)

    // Assert
    expect(installCode).toBe(0)
    expect(updateAllCode).toBe(0)
    expect(listCode).toBe(0)
    expect(disableCode).toBe(0)
    expect(errors).toEqual([])
    expect(outputs.join("\n")).toContain("Installed and activated calendar@1.0.0")
    expect(outputs.join("\n")).toContain("Updated and activated calendar@1.1.0")
    expect(outputs.join("\n")).toContain("Disabled notes@1.0.0")
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
