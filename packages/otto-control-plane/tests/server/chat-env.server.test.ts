import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import {
  resetCachedControlPlaneChatConfigForTests,
  resolveControlPlaneChatConfig,
} from "../../app/server/chat-env.server.js"

const cleanupPaths: string[] = []

afterEach(async () => {
  resetCachedControlPlaneChatConfigForTests()
  await Promise.all(
    cleanupPaths.splice(0).map(async (directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe("resolveControlPlaneChatConfig", () => {
  it("prefers local .env values", async () => {
    // Arrange
    const homeDirectory = await mkdtemp(path.join(tmpdir(), "otto-chat-env-home-"))
    const cwd = await mkdtemp(path.join(tmpdir(), "otto-chat-env-cwd-"))
    cleanupPaths.push(homeDirectory, cwd)

    await writeFile(
      path.join(cwd, ".env"),
      [
        "OTTO_OPENCODE_API_URL=http://192.168.1.11:4096",
        "OTTO_STATE_DB_PATH=/tmp/custom-otto-state.db",
      ].join("\n"),
      "utf8"
    )

    // Act
    const config = await resolveControlPlaneChatConfig({
      homeDirectory,
      cwd,
      environment: {
        OTTO_OPENCODE_API_URL: "http://127.0.0.1:9999",
        OTTO_STATE_DB_PATH: "/tmp/ignored.db",
      },
    })

    // Assert
    expect(config).toEqual({
      opencodeApiUrl: "http://192.168.1.11:4096",
      stateDatabasePath: "/tmp/custom-otto-state.db",
    })
  })

  it("falls back to Otto config defaults", async () => {
    // Arrange
    const homeDirectory = await mkdtemp(path.join(tmpdir(), "otto-chat-env-home-"))
    const cwd = await mkdtemp(path.join(tmpdir(), "otto-chat-env-cwd-"))
    cleanupPaths.push(homeDirectory, cwd)

    const configPath = path.join(homeDirectory, ".config", "otto", "config.jsonc")
    await mkdir(path.dirname(configPath), { recursive: true })
    await writeFile(
      configPath,
      JSON.stringify(
        {
          ottoHome: "/tmp/otto-home",
          opencode: {
            hostname: "0.0.0.0",
            port: 4222,
          },
        },
        null,
        2
      ),
      "utf8"
    )

    // Act
    const resolved = await resolveControlPlaneChatConfig({
      homeDirectory,
      cwd,
      environment: {},
    })

    // Assert
    expect(resolved).toEqual({
      opencodeApiUrl: "http://127.0.0.1:4222",
      stateDatabasePath: "/tmp/otto-home/data/otto-state.db",
    })
  })

  it("derives OpenCode host from external API URL when unset", async () => {
    // Arrange
    const homeDirectory = await mkdtemp(path.join(tmpdir(), "otto-chat-env-home-"))
    const cwd = await mkdtemp(path.join(tmpdir(), "otto-chat-env-cwd-"))
    cleanupPaths.push(homeDirectory, cwd)

    const configPath = path.join(homeDirectory, ".config", "otto", "config.jsonc")
    await mkdir(path.dirname(configPath), { recursive: true })
    await writeFile(
      configPath,
      JSON.stringify(
        {
          ottoHome: "/tmp/otto-home",
          opencode: {
            hostname: "0.0.0.0",
            port: 4333,
          },
        },
        null,
        2
      ),
      "utf8"
    )

    // Act
    const resolved = await resolveControlPlaneChatConfig({
      homeDirectory,
      cwd,
      environment: {
        OTTO_EXTERNAL_API_URL: "http://jeston-orin.local:4190",
      },
    })

    // Assert
    expect(resolved).toEqual({
      opencodeApiUrl: "http://jeston-orin.local:4333",
      stateDatabasePath: "/tmp/otto-home/data/otto-state.db",
    })
  })
})
