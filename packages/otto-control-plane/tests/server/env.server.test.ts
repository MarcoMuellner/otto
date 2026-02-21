import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import {
  resetCachedControlPlaneServerConfigForTests,
  resolveControlPlaneServerConfig,
} from "../../app/server/env.js"

const cleanupPaths: string[] = []

afterEach(async () => {
  resetCachedControlPlaneServerConfigForTests()
  await Promise.all(
    cleanupPaths.splice(0).map(async (directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe("resolveControlPlaneServerConfig", () => {
  it("prefers local .env values over process environment", async () => {
    // Arrange
    const homeDirectory = await mkdtemp(path.join(tmpdir(), "otto-control-plane-env-"))
    cleanupPaths.push(homeDirectory)
    const tokenFilePath = path.join(homeDirectory, "custom.token")
    await writeFile(tokenFilePath, "file-token\n", "utf8")

    const cwd = await mkdtemp(path.join(tmpdir(), "otto-control-plane-cwd-"))
    cleanupPaths.push(cwd)
    await writeFile(
      path.join(cwd, ".env"),
      [
        "OTTO_EXTERNAL_API_URL=http://192.168.1.77:4400",
        "OTTO_EXTERNAL_API_TOKEN=dotenv-token",
        `OTTO_EXTERNAL_API_TOKEN_FILE=${tokenFilePath}`,
      ].join("\n"),
      "utf8"
    )

    // Act
    const config = await resolveControlPlaneServerConfig({
      homeDirectory,
      cwd,
      environment: {
        OTTO_EXTERNAL_API_URL: "http://127.0.0.1:9999",
        OTTO_EXTERNAL_API_TOKEN: "env-token",
      },
    })

    // Assert
    expect(config).toEqual({
      externalApiBaseUrl: "http://192.168.1.77:4400",
      externalApiToken: "dotenv-token",
    })
  })

  it("prefers OTTO_EXTERNAL_API_TOKEN over token file", async () => {
    // Arrange
    const homeDirectory = await mkdtemp(path.join(tmpdir(), "otto-control-plane-env-"))
    cleanupPaths.push(homeDirectory)

    // Act
    const config = await resolveControlPlaneServerConfig({
      homeDirectory,
      cwd: homeDirectory,
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
      cwd: homeDirectory,
      environment: {
        OTTO_EXTERNAL_API_TOKEN_FILE: tokenFilePath,
      },
    })

    // Assert
    expect(config.externalApiBaseUrl).toBe("http://127.0.0.1:4190")
    expect(config.externalApiToken).toBe("file-token")
  })

  it("falls back when .env has empty values", async () => {
    // Arrange
    const homeDirectory = await mkdtemp(path.join(tmpdir(), "otto-control-plane-env-"))
    cleanupPaths.push(homeDirectory)

    const cwd = await mkdtemp(path.join(tmpdir(), "otto-control-plane-cwd-"))
    cleanupPaths.push(cwd)
    await writeFile(
      path.join(cwd, ".env"),
      ["OTTO_EXTERNAL_API_URL=", "OTTO_EXTERNAL_API_TOKEN=", "OTTO_EXTERNAL_API_TOKEN_FILE="].join(
        "\n"
      ),
      "utf8"
    )

    // Act
    const config = await resolveControlPlaneServerConfig({
      homeDirectory,
      cwd,
      environment: {
        OTTO_EXTERNAL_API_URL: "http://127.0.0.1:4510",
        OTTO_EXTERNAL_API_TOKEN: "from-env",
      },
    })

    // Assert
    expect(config).toEqual({
      externalApiBaseUrl: "http://127.0.0.1:4510",
      externalApiToken: "from-env",
    })
  })

  it("throws when token file is missing and no OTTO_EXTERNAL_API_TOKEN is set", async () => {
    // Arrange
    const homeDirectory = await mkdtemp(path.join(tmpdir(), "otto-control-plane-env-"))
    cleanupPaths.push(homeDirectory)

    // Act + Assert
    await expect(
      resolveControlPlaneServerConfig({
        homeDirectory,
        cwd: homeDirectory,
        environment: {},
      })
    ).rejects.toThrow(/internal-api.token/)
  })
})
