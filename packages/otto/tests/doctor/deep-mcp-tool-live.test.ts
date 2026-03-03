import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { createDeepMcpToolLiveCheck } from "../../src/doctor/checks/deep/mcp-tool-live.js"
import { executeDoctorLiveProbe } from "../../src/doctor/probes/executor.js"
import { createMcpToolLiveProbes } from "../../src/doctor/probes/mcp-tool.js"

describe("deep MCP/tool live check", () => {
  it("registers MCP and tool probes for enabled integrations", async () => {
    // Arrange
    const probes = await createMcpToolLiveProbes({
      listEnabledExtensions: async () => [
        {
          id: "anylist",
          activeVersion: "0.1.0",
        },
      ],
      loadManifest: async () => ({
        id: "anylist",
        version: "0.1.0",
        payload: {
          mcp: {
            file: "mcp.jsonc",
          },
          tools: {
            path: "tools",
          },
        },
      }),
      loadMcpFragment: async () => ({
        anylist: {
          command: ["npx", "-y", "fake-server"],
          enabled: true,
        },
      }),
      listToolScriptPaths: async () => ["/tmp/anylist.ts"],
      startMcpCommandProbe: async () => ({
        ok: true,
        durationMs: 10,
      }),
      runToolSessionProbe: async () => ({
        ok: true,
        statusCode: "OK",
        durationMs: 10,
      }),
    })

    // Act
    const ids = probes.map((probe) => probe.id)

    // Assert
    expect(ids).toContain("probe.mcp.anylist.anylist.startup")
    expect(ids).toContain("probe.tool.anylist.anylist.oneshot-session")
  })

  it("skips probes blocked by cleanup safety gate", async () => {
    // Arrange
    const check = createDeepMcpToolLiveCheck({
      createProbes: async () => [
        {
          id: "probe.integration.unsafe",
          integrationId: "unsafe",
          mutating: true,
          cleanupRequired: true,
          cleanupGuaranteed: false,
          lockKey: "integration:unsafe",
          execute: async () => {
            return {
              severity: "ok",
              summary: "should not run",
            }
          },
        },
      ],
    })

    // Act
    const result = await check.run({ mode: "deep" })

    // Assert
    expect(result.severity).toBe("warning")
    expect(
      result.evidence.some((entry) => entry.code === "PROBE_SKIPPED_CLEANUP_NOT_GUARANTEED")
    ).toBe(true)
  })

  it("always runs cleanup path for mutating probes", async () => {
    // Arrange
    let cleaned = false

    // Act
    const result = await executeDoctorLiveProbe({
      id: "probe.integration.mutating",
      integrationId: "anylist",
      mutating: true,
      cleanupRequired: true,
      cleanupGuaranteed: true,
      lockKey: "integration:anylist",
      execute: async ({ addCleanupStep }) => {
        addCleanupStep({
          id: "cleanup-step",
          run: async () => {
            cleaned = true
          },
        })

        throw new Error("mutating execution failed")
      },
      postCleanupVerify: async () => {
        return {
          ok: cleaned,
          code: "POST_VERIFY_FAILED",
          reason: "cleanup did not run",
        }
      },
    })

    // Assert
    expect(result.severity).toBe("error")
    expect(cleaned).toBe(true)
    expect(result.evidence.some((entry) => entry.code === "PROBE_CLEANUP_STEP_RUN_OK")).toBe(true)
  })

  it("rejects MCP fragment path traversal outside extension store", async () => {
    // Arrange
    const ottoHome = await mkdtemp(path.join(os.tmpdir(), "otto-mcp-probe-"))

    try {
      // Act + Assert
      await expect(
        createMcpToolLiveProbes({
          ottoHome,
          listEnabledExtensions: async () => [
            {
              id: "google-calendar",
              activeVersion: "0.1.0",
            },
          ],
          loadManifest: async () => ({
            id: "google-calendar",
            version: "0.1.0",
            payload: {
              mcp: {
                file: "../../outside/mcp.jsonc",
              },
            },
          }),
        })
      ).rejects.toThrow("path escapes extension store root")
    } finally {
      await rm(ottoHome, { recursive: true, force: true })
    }
  })

  it("rejects tool path traversal outside extension store", async () => {
    // Arrange
    const ottoHome = await mkdtemp(path.join(os.tmpdir(), "otto-tool-probe-"))

    try {
      // Act + Assert
      await expect(
        createMcpToolLiveProbes({
          ottoHome,
          listEnabledExtensions: async () => [
            {
              id: "anylist",
              activeVersion: "0.1.0",
            },
          ],
          loadManifest: async () => ({
            id: "anylist",
            version: "0.1.0",
            payload: {
              tools: {
                path: "../../outside/tools",
              },
            },
          }),
        })
      ).rejects.toThrow("path escapes extension store root")
    } finally {
      await rm(ottoHome, { recursive: true, force: true })
    }
  })
})
