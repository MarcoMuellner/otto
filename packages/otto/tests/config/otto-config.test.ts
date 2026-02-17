import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { tmpdir } from "node:os"

import { afterEach, describe, expect, it } from "vitest"

import {
  buildDefaultOttoConfig,
  ensureOttoConfigFile,
  resolveOttoConfigPath,
} from "../../src/config/otto-config.js"

const TEMP_PREFIX = path.join(tmpdir(), "otto-config-")
const cleanupPaths: string[] = []

afterEach(async () => {
  await Promise.all(
    cleanupPaths.splice(0).map(async (directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe("resolveOttoConfigPath", () => {
  it("resolves under ~/.config/otto", () => {
    const homeDirectory = "/tmp/test-home"
    const configPath = resolveOttoConfigPath(homeDirectory)

    expect(configPath).toBe("/tmp/test-home/.config/otto/config.jsonc")
  })
})

describe("ensureOttoConfigFile", () => {
  it("creates the config file with defaults when missing", async () => {
    const homeDirectory = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(homeDirectory)

    const result = await ensureOttoConfigFile(homeDirectory)
    const saved = await readFile(result.configPath, "utf8")

    expect(result.created).toBe(true)
    expect(result.config).toEqual(buildDefaultOttoConfig(homeDirectory))
    expect(JSON.parse(saved)).toEqual(buildDefaultOttoConfig(homeDirectory))
  })

  it("loads existing config without rewriting it", async () => {
    const homeDirectory = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(homeDirectory)

    const configPath = resolveOttoConfigPath(homeDirectory)
    const custom = {
      version: 1,
      ottoHome: path.join(homeDirectory, "custom-otto-home"),
      opencode: {
        hostname: "127.0.0.1",
        port: 4999,
      },
    }

    await mkdir(path.dirname(configPath), { recursive: true })
    await writeFile(configPath, `${JSON.stringify(custom, null, 2)}\n`, "utf8")

    const result = await ensureOttoConfigFile(homeDirectory)

    expect(result.created).toBe(false)
    expect(result.config).toEqual(custom)
  })

  it("throws when existing config is invalid", async () => {
    const homeDirectory = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(homeDirectory)

    const configPath = resolveOttoConfigPath(homeDirectory)

    await mkdir(path.dirname(configPath), { recursive: true })
    await writeFile(configPath, "not-json", "utf8")

    await expect(ensureOttoConfigFile(homeDirectory)).rejects.toThrow("Invalid JSON")
  })
})
