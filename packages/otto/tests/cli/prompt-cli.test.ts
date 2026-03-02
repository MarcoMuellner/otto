import { describe, expect, it, vi } from "vitest"

import { runPromptCliCommand } from "../../src/prompt-cli.js"
import type { PromptFileEntry } from "../../src/prompt-management/index.js"

const testEnv = {
  OTTO_HOME: "/tmp/.otto",
}

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

const sampleEntries: PromptFileEntry[] = [
  {
    source: "user",
    relativePath: "layers/core-persona.md",
    absolutePath: "/tmp/.otto/prompts/layers/core-persona.md",
  },
  {
    source: "system",
    relativePath: "layers/media-cli.md",
    absolutePath: "/tmp/.otto/system-prompts/layers/media-cli.md",
  },
]

describe("runPromptCliCommand", () => {
  it("prints prompt inventory for list command", async () => {
    // Arrange
    const { outputs, errors, streams } = createStreams()

    // Act
    const exitCode = await runPromptCliCommand(["list"], streams, testEnv, {
      listPromptFiles: async () => sampleEntries,
      pickPromptFile: async () => null,
      openEditor: async () => {},
    })

    // Assert
    expect(exitCode).toBe(0)
    expect(errors).toEqual([])
    expect(outputs).toContain("source\tpath")
    expect(outputs).toContain("user\tlayers/core-persona.md")
    expect(outputs).toContain("system\tlayers/media-cli.md")
  })

  it("opens selected user prompt file", async () => {
    // Arrange
    const { errors, streams } = createStreams()
    const openEditor = vi.fn(async () => {})

    // Act
    const exitCode = await runPromptCliCommand([], streams, testEnv, {
      listPromptFiles: async () => sampleEntries,
      pickPromptFile: async ({ entries }) => entries[0] ?? null,
      openEditor,
    })

    // Assert
    expect(exitCode).toBe(0)
    expect(errors).toEqual([])
    expect(openEditor).toHaveBeenCalledWith({
      filePath: "/tmp/.otto/prompts/layers/core-persona.md",
      environment: testEnv,
    })
  })

  it("warns when selected prompt is system-owned", async () => {
    // Arrange
    const { errors, streams } = createStreams()

    // Act
    const exitCode = await runPromptCliCommand([], streams, testEnv, {
      listPromptFiles: async () => sampleEntries,
      pickPromptFile: async ({ entries }) => entries[1] ?? null,
      openEditor: async () => {},
    })

    // Assert
    expect(exitCode).toBe(0)
    expect(errors).toContain(
      "Selected a system-owned prompt file. Changes may be overwritten by otto setup/update."
    )
  })

  it("returns success when picker is cancelled", async () => {
    // Arrange
    const { outputs, errors, streams } = createStreams()

    // Act
    const exitCode = await runPromptCliCommand([], streams, testEnv, {
      listPromptFiles: async () => sampleEntries,
      pickPromptFile: async () => null,
      openEditor: async () => {},
    })

    // Assert
    expect(exitCode).toBe(0)
    expect(errors).toEqual([])
    expect(outputs).toContain("Prompt picker cancelled")
  })

  it("returns actionable error when no prompt files are available", async () => {
    // Arrange
    const { errors, streams } = createStreams()

    // Act
    const exitCode = await runPromptCliCommand([], streams, testEnv, {
      listPromptFiles: async () => [],
      pickPromptFile: async () => null,
      openEditor: async () => {},
    })

    // Assert
    expect(exitCode).toBe(1)
    expect(errors[0]).toContain("No prompt files found under")
  })

  it("returns actionable error when editor launch fails", async () => {
    // Arrange
    const { errors, streams } = createStreams()

    // Act
    const exitCode = await runPromptCliCommand([], streams, testEnv, {
      listPromptFiles: async () => sampleEntries,
      pickPromptFile: async ({ entries }) => entries[0] ?? null,
      openEditor: async () => {
        throw new Error(
          "No usable editor found. Attempted 'vi'. Set $VISUAL or $EDITOR to an installed terminal editor."
        )
      },
    })

    // Assert
    expect(exitCode).toBe(1)
    expect(errors[0]).toContain("No usable editor found")
  })
})
