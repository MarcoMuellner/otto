import { describe, expect, it } from "vitest"

import { PROMPT_LAYER_ORDER, resolvePromptComposition } from "../../src/prompt-management/index.js"

describe("resolvePromptComposition", () => {
  it("assembles markdown in fixed core -> surface -> media -> task-profile order", () => {
    // Arrange
    const input = {
      layers: {
        media: {
          status: "resolved" as const,
          markdown: "## Media Layer\nUse chatapps response patterns.",
        },
        "task-profile": {
          status: "resolved" as const,
          markdown: "## Task Profile\nYou are processing a reminder task.",
        },
        surface: {
          status: "resolved" as const,
          markdown: "## Surface Layer\nThis turn comes from Telegram.",
        },
        "core-persona": {
          status: "resolved" as const,
          markdown: "# Core Persona\nBe concise and outcome focused.",
        },
      },
    }

    // Act
    const result = resolvePromptComposition(input)

    // Assert
    expect(PROMPT_LAYER_ORDER).toEqual(["core-persona", "surface", "media", "task-profile"])
    expect(result.segments).toEqual([
      "# Core Persona\nBe concise and outcome focused.",
      "## Surface Layer\nThis turn comes from Telegram.",
      "## Media Layer\nUse chatapps response patterns.",
      "## Task Profile\nYou are processing a reminder task.",
    ])
    expect(result.markdown).toBe(result.segments.join("\n\n"))
    expect(result.layers.map((layer) => layer.layer)).toEqual(PROMPT_LAYER_ORDER)
    expect(result.warnings).toEqual([])
  })

  it("represents omitted layers as missing diagnostics without throwing", () => {
    // Arrange
    const input = {
      layers: {
        "core-persona": {
          status: "resolved" as const,
          markdown: "# Core\nKeep responses direct.",
        },
        media: {
          status: "resolved" as const,
          markdown: "## Media\nChatapps medium is active.",
        },
      },
    }

    // Act
    const result = resolvePromptComposition(input)

    // Assert
    expect(result.markdown).toBe(
      "# Core\nKeep responses direct.\n\n## Media\nChatapps medium is active."
    )
    expect(result.layers).toEqual([
      {
        layer: "core-persona",
        status: "resolved",
        markdown: "# Core\nKeep responses direct.",
        applied: true,
      },
      {
        layer: "surface",
        status: "missing",
        applied: false,
      },
      {
        layer: "media",
        status: "resolved",
        markdown: "## Media\nChatapps medium is active.",
        applied: true,
      },
      {
        layer: "task-profile",
        status: "missing",
        applied: false,
      },
    ])
    expect(result.warnings).toEqual([
      {
        code: "missing_layer",
        layer: "surface",
        message: "Prompt layer 'surface' is missing and will be skipped.",
      },
      {
        code: "missing_layer",
        layer: "task-profile",
        message: "Prompt layer 'task-profile' is missing and will be skipped.",
      },
    ])
  })

  it("returns invalid-layer diagnostics and skips invalid segments", () => {
    // Arrange
    const input = {
      layers: {
        "core-persona": {
          status: "resolved" as const,
          markdown: "# Core\nAlways provide concrete next steps.",
        },
        surface: {
          status: "invalid" as const,
          reason: "Failed to parse markdown file header",
        },
        media: {
          status: "resolved" as const,
          markdown: "## Media\nUse concise mobile formatting.",
        },
        "task-profile": {
          status: "resolved" as const,
          markdown: "   ",
        },
      },
    }

    // Act
    const result = resolvePromptComposition(input)

    // Assert
    expect(result.segments).toEqual([
      "# Core\nAlways provide concrete next steps.",
      "## Media\nUse concise mobile formatting.",
    ])
    expect(result.warnings).toEqual([
      {
        code: "invalid_layer",
        layer: "surface",
        message: "Prompt layer 'surface' is invalid: Failed to parse markdown file header",
      },
      {
        code: "invalid_layer",
        layer: "task-profile",
        message: "Prompt layer 'task-profile' is invalid: Layer markdown is empty",
      },
    ])
  })

  it("handles malformed runtime input shapes without throwing", () => {
    // Arrange
    const resolveUnsafe = resolvePromptComposition as (
      input: unknown
    ) => ReturnType<typeof resolvePromptComposition>

    // Act
    const fromEmptyObject = resolveUnsafe({})
    const fromNullLayers = resolveUnsafe({ layers: null })

    // Assert
    expect(fromEmptyObject.markdown).toBe("")
    expect(fromNullLayers.markdown).toBe("")

    expect(fromEmptyObject.warnings).toEqual([
      {
        code: "missing_layer",
        layer: "core-persona",
        message: "Prompt layer 'core-persona' is missing and will be skipped.",
      },
      {
        code: "missing_layer",
        layer: "surface",
        message: "Prompt layer 'surface' is missing and will be skipped.",
      },
      {
        code: "missing_layer",
        layer: "media",
        message: "Prompt layer 'media' is missing and will be skipped.",
      },
      {
        code: "missing_layer",
        layer: "task-profile",
        message: "Prompt layer 'task-profile' is missing and will be skipped.",
      },
    ])
    expect(fromNullLayers.warnings).toEqual(fromEmptyObject.warnings)
  })
})
