import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"

import { resolveJobSystemPrompt } from "../../src/prompt-management/index.js"

const TEMP_PREFIX = path.join(tmpdir(), "otto-job-prompt-resolution-")
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
          chatapps: "scheduled-chatapps",
          web: "scheduled-web",
          cli: "scheduled-cli",
        },
      },
      background: {
        default: "background-cli",
        media: {
          chatapps: "background-chatapps",
          web: "background-web",
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
          "core-persona": { source: "system", path: "layers/core.md" },
        },
      },
      "interactive-web": {
        layers: {
          "core-persona": { source: "system", path: "layers/core.md" },
        },
      },
      "interactive-cli": {
        layers: {
          "core-persona": { source: "system", path: "layers/core.md" },
        },
      },
      "scheduled-chatapps": {
        layers: {
          "core-persona": { source: "system", path: "layers/core.md" },
          surface: { source: "system", path: "layers/surface-scheduled.md" },
          media: { source: "system", path: "layers/media-chatapps.md" },
        },
      },
      "scheduled-web": {
        layers: {
          "core-persona": { source: "system", path: "layers/core.md" },
          surface: { source: "system", path: "layers/surface-scheduled.md" },
          media: { source: "system", path: "layers/media-web.md" },
        },
      },
      "scheduled-cli": {
        layers: {
          "core-persona": { source: "system", path: "layers/core.md" },
          surface: { source: "system", path: "layers/surface-scheduled.md" },
          media: { source: "system", path: "layers/media-cli.md" },
        },
      },
      "background-chatapps": {
        layers: {
          "core-persona": { source: "system", path: "layers/core.md" },
          surface: { source: "system", path: "layers/surface-background.md" },
          media: { source: "system", path: "layers/media-chatapps.md" },
        },
      },
      "background-web": {
        layers: {
          "core-persona": { source: "system", path: "layers/core.md" },
          surface: { source: "system", path: "system-only/unused.md" },
          media: { source: "system", path: "layers/media-web.md" },
        },
      },
      "background-cli": {
        layers: {
          "core-persona": { source: "system", path: "layers/core.md" },
          surface: { source: "system", path: "layers/surface-background.md" },
          media: { source: "system", path: "layers/media-cli.md" },
        },
      },
      "watchdog-default": {
        layers: {
          "core-persona": { source: "system", path: "layers/watchdog.md" },
        },
      },
    },
  }
}

const writePromptWorkspace = async (input: {
  ottoHome: string
  systemMapping: Record<string, unknown>
  userMapping?: Record<string, unknown>
  systemLayers?: Array<{ relativePath: string; markdown: string }>
  userLayers?: Array<{ relativePath: string; markdown: string }>
}): Promise<void> => {
  const systemDirectory = path.join(input.ottoHome, "system-prompts")
  const userDirectory = path.join(input.ottoHome, "prompts")

  await mkdir(path.join(systemDirectory, "layers"), { recursive: true })
  await mkdir(path.join(systemDirectory, "task-profiles"), { recursive: true })
  await mkdir(path.join(userDirectory, "layers"), { recursive: true })
  await mkdir(path.join(userDirectory, "task-profiles"), { recursive: true })

  await writeFile(
    path.join(systemDirectory, "mapping.jsonc"),
    `${JSON.stringify(input.systemMapping, null, 2)}\n`,
    "utf8"
  )
  await writeFile(
    path.join(userDirectory, "mapping.jsonc"),
    `${JSON.stringify(input.userMapping ?? { version: 1, selectors: {}, routes: {} }, null, 2)}\n`,
    "utf8"
  )

  for (const layer of input.systemLayers ?? []) {
    const targetPath = path.join(systemDirectory, layer.relativePath)
    await mkdir(path.dirname(targetPath), { recursive: true })
    await writeFile(targetPath, layer.markdown, "utf8")
  }

  for (const layer of input.userLayers ?? []) {
    const targetPath = path.join(userDirectory, layer.relativePath)
    await mkdir(path.dirname(targetPath), { recursive: true })
    await writeFile(targetPath, layer.markdown, "utf8")
  }
}

afterEach(async () => {
  await Promise.all(
    cleanupPaths.splice(0).map(async (directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe("resolveJobSystemPrompt", () => {
  it("resolves scheduled prompt chain with default cli media and optional task profile", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)

    await writePromptWorkspace({
      ottoHome: tempRoot,
      systemMapping: buildSystemMapping(),
      systemLayers: [
        { relativePath: "layers/core.md", markdown: "# Core\nSystem core" },
        { relativePath: "layers/surface-scheduled.md", markdown: "## Surface\nScheduled surface" },
        { relativePath: "layers/media-cli.md", markdown: "## Media\nCLI media" },
        { relativePath: "layers/watchdog.md", markdown: "# Watchdog\nSystem watchdog" },
        {
          relativePath: "task-profiles/general-reminder.md",
          markdown: "## Task Profile\nSystem reminder profile",
        },
      ],
      userLayers: [
        {
          relativePath: "task-profiles/general-reminder.md",
          markdown: "## Task Profile\nUser reminder profile",
        },
      ],
    })

    // Act
    const resolved = await resolveJobSystemPrompt({
      ottoHome: tempRoot,
      flow: "scheduled",
      profileId: "general-reminder",
    })

    // Assert
    expect(resolved.media).toBe("cli")
    expect(resolved.routeKey).toBe("scheduled-cli")
    expect(resolved.systemPrompt).toBe(
      "# Core\nSystem core\n\n## Surface\nScheduled surface\n\n## Media\nCLI media\n\n## Task Profile\nUser reminder profile"
    )
    expect(resolved.warnings).toEqual([])
  })

  it("resolves background prompt chain for explicit chatapps media", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)

    await writePromptWorkspace({
      ottoHome: tempRoot,
      systemMapping: buildSystemMapping(),
      systemLayers: [
        { relativePath: "layers/core.md", markdown: "# Core\nSystem core" },
        {
          relativePath: "layers/surface-background.md",
          markdown: "## Surface\nBackground surface",
        },
        { relativePath: "layers/media-chatapps.md", markdown: "## Media\nChatapps media" },
        { relativePath: "layers/watchdog.md", markdown: "# Watchdog\nSystem watchdog" },
      ],
    })

    // Act
    const resolved = await resolveJobSystemPrompt({
      ottoHome: tempRoot,
      flow: "background",
      media: "chatapps",
    })

    // Assert
    expect(resolved.media).toBe("chatapps")
    expect(resolved.routeKey).toBe("background-chatapps")
    expect(resolved.systemPrompt).toContain("## Media\nChatapps media")
    expect(resolved.warnings).toEqual([])
  })

  it("rejects unsafe task profile ids to prevent path traversal", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)

    await writePromptWorkspace({
      ottoHome: tempRoot,
      systemMapping: buildSystemMapping(),
      systemLayers: [
        { relativePath: "layers/core.md", markdown: "# Core\nSystem core" },
        { relativePath: "layers/surface-scheduled.md", markdown: "## Surface\nScheduled surface" },
        { relativePath: "layers/media-cli.md", markdown: "## Media\nCLI media" },
        { relativePath: "layers/watchdog.md", markdown: "# Watchdog\nSystem watchdog" },
      ],
      userLayers: [{ relativePath: "secrets.md", markdown: "## Secret\nDo not load" }],
    })

    const logger = {
      warn: vi.fn(),
      error: vi.fn(),
    }

    // Act
    const resolved = await resolveJobSystemPrompt({
      ottoHome: tempRoot,
      flow: "scheduled",
      profileId: "../secrets",
      logger,
    })

    // Assert
    expect(resolved.systemPrompt).toBe(
      "# Core\nSystem core\n\n## Surface\nScheduled surface\n\n## Media\nCLI media"
    )
    expect(resolved.warnings.some((warning) => warning.code === "invalid_task_profile_id")).toBe(
      true
    )
    expect(resolved.systemPrompt).not.toContain("Do not load")
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ warningCode: "invalid_task_profile_id" }),
      expect.stringContaining("Ignoring task profile")
    )
  })

  it("enforces watchdog resolution through system mapping only", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)

    await writePromptWorkspace({
      ottoHome: tempRoot,
      systemMapping: buildSystemMapping(),
      userMapping: {
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
                path: "layers/watchdog-user.md",
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
      systemLayers: [
        { relativePath: "layers/watchdog.md", markdown: "# Watchdog\nSystem watchdog" },
      ],
      userLayers: [
        { relativePath: "layers/watchdog-user.md", markdown: "# Watchdog\nUser watchdog" },
      ],
    })

    // Act
    const resolved = await resolveJobSystemPrompt({
      ottoHome: tempRoot,
      flow: "watchdog",
    })

    // Assert
    expect(resolved.mappingSource).toBe("system")
    expect(resolved.routeKey).toBe("watchdog-default")
    expect(resolved.systemPrompt).toBe("# Watchdog\nSystem watchdog")
    expect(
      resolved.warnings.some((warning) => warning.code === "watchdog_user_override_blocked")
    ).toBe(true)
  })

  it("logs missing and invalid user layers while continuing with empty layer behavior", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)

    await writePromptWorkspace({
      ottoHome: tempRoot,
      systemMapping: buildSystemMapping(),
      userMapping: {
        version: 1,
        selectors: {
          background: {
            media: {
              web: "background-user-web",
            },
          },
        },
        routes: {
          "background-user-web": {
            layers: {
              "core-persona": { source: "system", path: "layers/core.md" },
              surface: { source: "user", path: "layers/surface-missing.md" },
              media: { source: "user", path: "layers/media-empty.md" },
            },
          },
        },
      },
      systemLayers: [
        { relativePath: "layers/core.md", markdown: "# Core\nSystem core" },
        { relativePath: "layers/watchdog.md", markdown: "# Watchdog\nSystem watchdog" },
      ],
      userLayers: [{ relativePath: "layers/media-empty.md", markdown: "   " }],
    })

    const logger = {
      warn: vi.fn(),
      error: vi.fn(),
    }

    // Act
    const resolved = await resolveJobSystemPrompt({
      ottoHome: tempRoot,
      flow: "background",
      media: "web",
      logger,
    })

    // Assert
    expect(resolved.systemPrompt).toBe("# Core\nSystem core")
    expect(resolved.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "missing_layer",
          message: "Prompt layer 'surface' is missing and will be skipped.",
        }),
        expect.objectContaining({
          code: "invalid_layer",
          message: "Prompt layer 'media' is invalid: Layer markdown is empty",
        }),
      ])
    )
    expect(logger.error).toHaveBeenCalledTimes(2)
  })
})
