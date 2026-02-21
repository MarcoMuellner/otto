import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import {
  resetCachedControlPlaneServerConfigForTests,
  resolveControlPlaneServerConfig,
} from "../../app/server/env.server.js"

const cleanupPaths: string[] = []

afterEach(async () => {
  resetCachedControlPlaneServerConfigForTests()
  await Promise.all(
    cleanupPaths.splice(0).map(async (directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe("resolveControlPlaneServerConfig", () => {
  it("prefers OTTO_EXTERNAL_API_TOKEN over token file", async () => {
    // Arrange
    const homeDirectory = await mkdtemp(path.join(tmpdir(), "otto-control-plane-env-"))
    cleanupPaths.push(homeDirectory)

    // Act
    const config = await resolveControlPlaneServerConfig({
      homeDirectory,
      environment: {
        OTTO_EXTERNAL_API_URL: "http://192.168.1.50:4190",
        OTTO_EXTERNAL_API_TOKEN: "env-token",
      },
    })

    // Assert
    expect(config).toEqual({
      externalApiBaseUrl: "http://192.168.1.50:4190",
      externalApiToken: "env-token",
    })
  })

  it("falls back to token file when OTTO_EXTERNAL_API_TOKEN is not set", async () => {
    // Arrange
    const homeDirectory = await mkdtemp(path.join(tmpdir(), "otto-control-plane-env-"))
    cleanupPaths.push(homeDirectory)
    const tokenFilePath = path.join(homeDirectory, "custom.token")
    await writeFile(tokenFilePath, "file-token\n", "utf8")

    // Act
    const config = await resolveControlPlaneServerConfig({
      homeDirectory,
      environment: {
        OTTO_EXTERNAL_API_TOKEN_FILE: tokenFilePath,
      },
    })

    // Assert
    expect(config.externalApiBaseUrl).toBe("http://127.0.0.1:4190")
    expect(config.externalApiToken).toBe("file-token")
  })

  it("throws when token file is missing and no OTTO_EXTERNAL_API_TOKEN is set", async () => {
    // Arrange
    const homeDirectory = await mkdtemp(path.join(tmpdir(), "otto-control-plane-env-"))
    cleanupPaths.push(homeDirectory)

    // Act + Assert
    await expect(
      resolveControlPlaneServerConfig({
        homeDirectory,
        environment: {},
      })
    ).rejects.toThrow(/internal-api.token/)
  })
})
