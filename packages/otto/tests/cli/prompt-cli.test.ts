import { describe, expect, it, vi } from "vitest"

import {
  resolveEditorCandidates,
  resolveNextPickerIndex,
  runPromptCliCommand,
} from "../../src/prompt-cli.js"

const createStreams = () => {
  const outputs: string[] = []
  const errors: string[] = []

  return {
    outputs,
    errors,
    streams: {
      stdout: {
        log: (value?: unknown) => outputs.push(String(value ?? "")),
      },
      stderr: {
        error: (value?: unknown) => errors.push(String(value ?? "")),
      },
    },
  }
}

describe("resolveNextPickerIndex", () => {
  it("wraps up/down selection across picker rows", () => {
    // Arrange
    const itemCount = 3

    // Act
    const fromStartUp = resolveNextPickerIndex(0, itemCount, "up")
    const fromEndDown = resolveNextPickerIndex(2, itemCount, "down")
    const fromMiddleUp = resolveNextPickerIndex(1, itemCount, "up")
    const fromMiddleDown = resolveNextPickerIndex(1, itemCount, "down")

    // Assert
    expect(fromStartUp).toBe(2)
    expect(fromEndDown).toBe(0)
    expect(fromMiddleUp).toBe(0)
    expect(fromMiddleDown).toBe(2)
  })
})

describe("resolveEditorCandidates", () => {
  it("prefers EDITOR then VISUAL before fallback editors", () => {
    // Arrange
    const env = {
      EDITOR: "code --wait",
      VISUAL: "vim",
    }

    // Act
    const candidates = resolveEditorCandidates(env)

    // Assert
    expect(candidates.map((candidate) => candidate.command)).toEqual([
      "code --wait",
      "vim",
      "nano",
      "vi",
    ])
  })
})

describe("runPromptCliCommand", () => {
  it("prints usage for help", async () => {
    // Arrange
    const { outputs, errors, streams } = createStreams()

    // Act
    const code = await runPromptCliCommand(["--help"], streams)

    // Assert
    expect(code).toBe(0)
    expect(errors).toEqual([])
    expect(outputs.join("\n")).toContain("Usage: prompt-cli")
  })

  it("blocks direct editing of system-owned prompt files", async () => {
    // Arrange
    const { errors, streams } = createStreams()
    const openInEditor = vi.fn()

    // Act
    const code = await runPromptCliCommand(
      ["prompt"],
      streams,
      {
        OTTO_HOME: "/tmp/otto-home",
      },
      {
        listPromptFiles: async () => [
          {
            source: "system",
            relativePath: "layers/core-persona.md",
            absolutePath: "/tmp/otto-home/system-prompts/layers/core-persona.md",
          },
        ],
        runPicker: async (entries) => ({
          status: "selected",
          entry: entries[0]!,
        }),
        openInEditor,
      }
    )

    // Assert
    expect(code).toBe(1)
    expect(errors[0]).toContain("Editing blocked for system-owned prompt")
    expect(errors[0]).toContain("/tmp/otto-home/prompts/layers/core-persona.md")
    expect(openInEditor).not.toHaveBeenCalled()
  })

  it("opens selected user-owned prompt file", async () => {
    // Arrange
    const { outputs, errors, streams } = createStreams()
    const openInEditor = vi.fn(async () => ({ command: "vim" }))

    // Act
    const code = await runPromptCliCommand(
      ["prompt"],
      streams,
      {
        OTTO_HOME: "/tmp/otto-home",
      },
      {
        listPromptFiles: async () => [
          {
            source: "user",
            relativePath: "layers/media-cli.md",
            absolutePath: "/tmp/otto-home/prompts/layers/media-cli.md",
          },
        ],
        runPicker: async (entries) => ({
          status: "selected",
          entry: entries[0]!,
        }),
        openInEditor,
      }
    )

    // Assert
    expect(code).toBe(0)
    expect(errors).toEqual([])
    expect(openInEditor).toHaveBeenCalledOnce()
    expect(outputs.join("\n")).toContain("Opened [user] layers/media-cli.md using vim")
  })

  it("returns success when picker is cancelled", async () => {
    // Arrange
    const { outputs, errors, streams } = createStreams()

    // Act
    const code = await runPromptCliCommand(
      ["prompt"],
      streams,
      {
        OTTO_HOME: "/tmp/otto-home",
      },
      {
        listPromptFiles: async () => [],
        runPicker: async () => ({
          status: "cancelled",
        }),
        openInEditor: async () => ({ command: "vim" }),
      }
    )

    // Assert
    expect(code).toBe(0)
    expect(errors).toEqual([])
    expect(outputs).toContain("Prompt picker cancelled")
  })
})
