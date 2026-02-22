import { describe, expect, it, vi } from "vitest"

import { createRuntimeModelResolver } from "../../src/model-management/resolver.js"

describe("createRuntimeModelResolver", () => {
  it("resolves job modelRef ahead of flow and global defaults", async () => {
    // Arrange
    const resolver = createRuntimeModelResolver({
      logger: { warn: vi.fn() },
      getCatalogSnapshot: () => ({
        refs: ["openai/gpt-5.3-codex", "anthropic/claude-sonnet-4"],
        updatedAt: 1_000,
        source: "network",
      }),
      fetchGlobalDefaultModelRef: async () => "openai/gpt-5.3-codex",
      loadOttoConfig: async () => ({
        version: 1,
        ottoHome: "/tmp/.otto",
        opencode: { hostname: "0.0.0.0", port: 4096 },
        telegram: {
          voice: {
            enabled: false,
            maxDurationSec: 180,
            maxBytes: 10 * 1024 * 1024,
            downloadTimeoutMs: 20_000,
          },
          transcription: {
            provider: "command",
            timeoutMs: 300_000,
            workerStartupTimeoutMs: 600_000,
            language: "auto",
            model: "small",
            command: null,
            commandArgs: ["{input}"],
            workerScriptPath: null,
            workerPythonPath: null,
            baseUrl: "http://127.0.0.1:9000",
            httpPath: "/v1/audio/transcriptions",
          },
        },
        modelManagement: {
          flowDefaults: {
            interactiveAssistant: "openai/gpt-5.3-codex",
            scheduledTasks: "openai/gpt-5.3-codex",
            heartbeat: null,
            watchdogFailures: null,
          },
        },
      }),
    })

    // Act
    const result = await resolver.resolve({
      flow: "scheduledTasks",
      jobModelRef: "anthropic/claude-sonnet-4",
    })

    // Assert
    expect(result).toEqual({
      providerId: "anthropic",
      modelId: "claude-sonnet-4",
      source: "job",
    })
  })

  it("falls back to global default when selected model is unavailable", async () => {
    // Arrange
    const warn = vi.fn()
    const resolver = createRuntimeModelResolver({
      logger: { warn },
      getCatalogSnapshot: () => ({
        refs: ["openai/gpt-5.3-codex"],
        updatedAt: 2_000,
        source: "cache",
      }),
      fetchGlobalDefaultModelRef: async () => "openai/gpt-5.3-codex",
      loadOttoConfig: async () => ({
        version: 1,
        ottoHome: "/tmp/.otto",
        opencode: { hostname: "0.0.0.0", port: 4096 },
        telegram: {
          voice: {
            enabled: false,
            maxDurationSec: 180,
            maxBytes: 10 * 1024 * 1024,
            downloadTimeoutMs: 20_000,
          },
          transcription: {
            provider: "command",
            timeoutMs: 300_000,
            workerStartupTimeoutMs: 600_000,
            language: "auto",
            model: "small",
            command: null,
            commandArgs: ["{input}"],
            workerScriptPath: null,
            workerPythonPath: null,
            baseUrl: "http://127.0.0.1:9000",
            httpPath: "/v1/audio/transcriptions",
          },
        },
        modelManagement: {
          flowDefaults: {
            interactiveAssistant: "anthropic/claude-sonnet-4",
            scheduledTasks: null,
            heartbeat: null,
            watchdogFailures: null,
          },
        },
      }),
    })

    // Act
    const result = await resolver.resolve({
      flow: "interactiveAssistant",
      jobModelRef: null,
    })

    // Assert
    expect(result).toEqual({
      providerId: "openai",
      modelId: "gpt-5.3-codex",
      source: "fallback_global_default",
    })
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        requestedModelRef: "anthropic/claude-sonnet-4",
        fallbackModelRef: "openai/gpt-5.3-codex",
      }),
      "Selected model is unavailable; falling back to OpenCode global default"
    )
  })
})
