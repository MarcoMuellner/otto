import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"

import { resolveInteractiveSystemPrompt } from "../../src/prompt-management/index.js"

const TEMP_PREFIX = path.join(tmpdir(), "otto-interactive-prompt-resolution-")
const cleanupPaths: string[] = []

const buildSystemMapping = (interactiveRouteLayers: {
  chatapps: Record<string, unknown>
  web: Record<string, unknown>
  cli: Record<string, unknown>
}): Record<string, unknown> => {
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
        layers: interactiveRouteLayers.chatapps,
      },
      "interactive-web": {
        layers: interactiveRouteLayers.web,
      },
      "interactive-cli": {
        layers: interactiveRouteLayers.cli,
      },
      "scheduled-cli": {
        layers: {
          "core-persona": {
            source: "system",
            path: "layers/core.md",
          },
        },
      },
      "background-cli": {
        layers: {
          "core-persona": {
            source: "system",
            path: "layers/core.md",
          },
        },
      },
      "watchdog-default": {
        layers: {
          "core-persona": {
            source: "system",
            path: "layers/core.md",
          },
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
  await mkdir(path.join(userDirectory, "layers"), { recursive: true })

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

describe("resolveInteractiveSystemPrompt", () => {
  it("applies interactive media mapping for telegram/web/cli and composes core+surface+media", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)

    await writePromptWorkspace({
      ottoHome: tempRoot,
      systemMapping: buildSystemMapping({
        chatapps: {
          "core-persona": { source: "system", path: "layers/core.md" },
          surface: { source: "system", path: "layers/surface-interactive.md" },
          media: { source: "system", path: "layers/media-chatapps.md" },
        },
        web: {
          "core-persona": { source: "system", path: "layers/core.md" },
          surface: { source: "system", path: "layers/surface-interactive.md" },
          media: { source: "system", path: "layers/media-web.md" },
        },
        cli: {
          "core-persona": { source: "system", path: "layers/core.md" },
          surface: { source: "system", path: "layers/surface-interactive.md" },
          media: { source: "system", path: "layers/media-cli.md" },
        },
      }),
      systemLayers: [
        {
          relativePath: "layers/core.md",
          markdown: "# Core\nCore layer",
        },
        {
          relativePath: "layers/surface-interactive.md",
          markdown: "## Surface\nInteractive surface layer",
        },
        {
          relativePath: "layers/media-chatapps.md",
          markdown: "## Media\nChat apps layer",
        },
        {
          relativePath: "layers/media-web.md",
          markdown: "## Media\nWeb layer",
        },
        {
          relativePath: "layers/media-cli.md",
          markdown: "## Media\nCLI layer",
        },
      ],
    })

    // Act
    const telegram = await resolveInteractiveSystemPrompt({
      ottoHome: tempRoot,
      surface: "telegram",
    })
    const web = await resolveInteractiveSystemPrompt({
      ottoHome: tempRoot,
      surface: "web",
    })
    const cli = await resolveInteractiveSystemPrompt({
      ottoHome: tempRoot,
      surface: "cli",
    })

    // Assert
    expect(telegram.media).toBe("chatapps")
    expect(telegram.routeKey).toBe("interactive-chatapps")
    expect(telegram.systemPrompt).toBe(
      "# Core\nCore layer\n\n## Surface\nInteractive surface layer\n\n## Media\nChat apps layer"
    )

    expect(web.media).toBe("web")
    expect(web.routeKey).toBe("interactive-web")
    expect(web.systemPrompt).toContain("## Media\nWeb layer")

    expect(cli.media).toBe("cli")
    expect(cli.routeKey).toBe("interactive-cli")
    expect(cli.systemPrompt).toContain("## Media\nCLI layer")
  })

  it("logs missing and invalid user prompt layers and continues without crashing", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)

    await writePromptWorkspace({
      ottoHome: tempRoot,
      systemMapping: buildSystemMapping({
        chatapps: {
          "core-persona": { source: "system", path: "layers/core.md" },
        },
        web: {
          "core-persona": { source: "system", path: "layers/core.md" },
          surface: { source: "user", path: "layers/surface-missing.md" },
          media: { source: "user", path: "layers/media-empty.md" },
        },
        cli: {
          "core-persona": { source: "system", path: "layers/core.md" },
        },
      }),
      systemLayers: [
        {
          relativePath: "layers/core.md",
          markdown: "# Core\nCore layer",
        },
      ],
      userLayers: [
        {
          relativePath: "layers/media-empty.md",
          markdown: "   ",
        },
      ],
    })

    const logger = {
      warn: vi.fn(),
      error: vi.fn(),
    }

    // Act
    const resolved = await resolveInteractiveSystemPrompt({
      ottoHome: tempRoot,
      surface: "web",
      logger,
    })

    // Assert
    expect(resolved.systemPrompt).toBe("# Core\nCore layer")
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
