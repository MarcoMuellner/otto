import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import { loadPromptRoutingMapping, resolvePromptRoute } from "../../src/prompt-management/index.js"

const TEMP_PREFIX = path.join(tmpdir(), "otto-prompt-mapping-")
const cleanupPaths: string[] = []

const buildSystemMapping = (): Record<string, unknown> => {
  return {
    version: 1,
    selectors: {
      interactive: {
        default: "interactive-cli",
        media: {
          chatapps: "interactive-chatapps",
          web: "interactive-web",
          cli: "interactive-cli",
        },
      },
      scheduled: {
        default: "scheduled-cli",
        media: {
          cli: "scheduled-cli",
        },
      },
      background: {
        default: "background-cli",
        media: {
          cli: "background-cli",
        },
      },
      watchdog: {
        default: "watchdog-default",
        media: {},
      },
    },
    routes: {
      "interactive-chatapps": {
        layers: {
          "core-persona": {
            source: "system",
            path: "layers/core-persona.md",
          },
        },
      },
      "interactive-web": {
        layers: {
          "core-persona": {
            source: "system",
            path: "layers/core-persona.md",
          },
        },
      },
      "interactive-cli": {
        layers: {
          "core-persona": {
            source: "system",
            path: "layers/core-persona.md",
          },
        },
      },
      "scheduled-cli": {
        layers: {
          "core-persona": {
            source: "system",
            path: "layers/core-persona.md",
          },
        },
      },
      "background-cli": {
        layers: {
          "core-persona": {
            source: "system",
            path: "layers/core-persona.md",
          },
        },
      },
      "watchdog-default": {
        layers: {
          "core-persona": {
            source: "system",
            path: "layers/core-persona.md",
          },
        },
      },
    },
  }
}

const writeMappingFiles = async (
  ottoHome: string,
  input: {
    system: Record<string, unknown>
    user: Record<string, unknown>
  }
): Promise<void> => {
  const systemDirectory = path.join(ottoHome, "system-prompts")
  const userDirectory = path.join(ottoHome, "prompts")

  await mkdir(systemDirectory, { recursive: true })
  await mkdir(userDirectory, { recursive: true })

  await writeFile(
    path.join(systemDirectory, "mapping.jsonc"),
    `${JSON.stringify(input.system, null, 2)}\n`,
    "utf8"
  )
  await writeFile(
    path.join(userDirectory, "mapping.jsonc"),
    `${JSON.stringify(input.user, null, 2)}\n`,
    "utf8"
  )
}

afterEach(async () => {
  await Promise.all(
    cleanupPaths.splice(0).map(async (directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe("prompt routing mapping", () => {
  it("merges user route overrides and resolves interactive media route deterministically", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)

    await writeMappingFiles(tempRoot, {
      system: buildSystemMapping(),
      user: {
        version: 1,
        selectors: {
          interactive: {
            media: {
              chatapps: "interactive-user-chatapps",
            },
          },
        },
        routes: {
          "interactive-user-chatapps": {
            layers: {
              "core-persona": {
                source: "user",
                path: "layers/core-persona.md",
              },
            },
          },
        },
      },
    })

    // Act
    const mapping = await loadPromptRoutingMapping({ ottoHome: tempRoot })
    const resolved = resolvePromptRoute({
      mapping,
      context: {
        flow: "interactive",
        media: "chatapps",
      },
    })

    // Assert
    expect(resolved.routeKey).toBe("interactive-user-chatapps")
    expect(resolved.mappingSource).toBe("effective")
    expect(resolved.route.layers["core-persona"]).toEqual({
      source: "user",
      path: "layers/core-persona.md",
    })
  })

  it("defaults scheduled and background route media to cli", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)

    await writeMappingFiles(tempRoot, {
      system: buildSystemMapping(),
      user: {
        version: 1,
        selectors: {},
        routes: {},
      },
    })

    // Act
    const mapping = await loadPromptRoutingMapping({ ottoHome: tempRoot })
    const scheduled = resolvePromptRoute({
      mapping,
      context: {
        flow: "scheduled",
      },
    })
    const background = resolvePromptRoute({
      mapping,
      context: {
        flow: "background",
        media: null,
      },
    })

    // Assert
    expect(scheduled.media).toBe("cli")
    expect(scheduled.routeKey).toBe("scheduled-cli")
    expect(background.media).toBe("cli")
    expect(background.routeKey).toBe("background-cli")
  })

  it("logs and skips invalid user mapping entries without crashing", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const warnCalls: Array<{ warningCode: unknown; message: string | undefined }> = []

    await writeMappingFiles(tempRoot, {
      system: buildSystemMapping(),
      user: {
        version: 1,
        selectors: {
          interactive: {
            media: {
              chatapps: "missing-route",
            },
          },
        },
        routes: {
          "invalid-route": {
            layers: {
              invalid: {
                source: "user",
                path: "layers/invalid.md",
              },
            },
          },
        },
      },
    })

    // Act
    const mapping = await loadPromptRoutingMapping({
      ottoHome: tempRoot,
      logger: {
        warn: (context: unknown, message?: string): void => {
          const warningCode =
            typeof context === "object" &&
            context !== null &&
            Object.prototype.hasOwnProperty.call(context, "warningCode")
              ? Reflect.get(context, "warningCode")
              : undefined
          warnCalls.push({ warningCode, message })
        },
      },
    })
    const resolved = resolvePromptRoute({
      mapping,
      context: {
        flow: "interactive",
        media: "chatapps",
      },
    })

    // Assert
    expect(mapping.warnings.some((warning) => warning.code === "invalid_user_mapping")).toBe(true)
    expect(mapping.warnings.some((warning) => warning.code === "unknown_user_route")).toBe(true)
    expect(warnCalls.length).toBeGreaterThan(0)
    expect(resolved.routeKey).toBe("interactive-chatapps")
  })

  it("enforces watchdog route resolution from system mapping only", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)

    await writeMappingFiles(tempRoot, {
      system: buildSystemMapping(),
      user: {
        version: 1,
        selectors: {
          watchdog: {
            default: "watchdog-user",
          },
        },
        routes: {
          "watchdog-default": {
            layers: {
              "core-persona": {
                source: "user",
                path: "layers/core-persona.md",
              },
            },
          },
          "watchdog-user": {
            layers: {
              "core-persona": {
                source: "user",
                path: "layers/watchdog-user.md",
              },
            },
          },
        },
      },
    })

    // Act
    const mapping = await loadPromptRoutingMapping({ ottoHome: tempRoot })
    const resolved = resolvePromptRoute({
      mapping,
      context: {
        flow: "watchdog",
      },
    })

    // Assert
    expect(
      mapping.warnings.some((warning) => warning.code === "watchdog_user_override_blocked")
    ).toBe(true)
    expect(mapping.effective.selectors.watchdog.default).toBe("watchdog-default")
    expect(mapping.effective.routes["watchdog-default"]?.layers["core-persona"]).toEqual({
      source: "system",
      path: "layers/core-persona.md",
    })
    expect(resolved.mappingSource).toBe("system")
    expect(resolved.routeKey).toBe("watchdog-default")
    expect(resolved.route.layers["core-persona"]).toEqual({
      source: "system",
      path: "layers/core-persona.md",
    })
  })
})
