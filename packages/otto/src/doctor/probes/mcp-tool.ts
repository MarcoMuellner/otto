import { spawn } from "node:child_process"
import { constants } from "node:fs"
import { access, readFile, readdir } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"

import { parseJsonc } from "otto-extension-sdk"
import { z } from "zod"

import { createExtensionStateRepository } from "../../extensions/state.js"
import type { DoctorLiveProbeDefinition } from "./executor.js"

type EnabledExtensionRecord = {
  id: string
  activeVersion: string | null
}

type DeepMcpToolProbeDependencies = {
  environment?: NodeJS.ProcessEnv
  ottoHome?: string
  listEnabledExtensions?: () => Promise<EnabledExtensionRecord[]>
  loadManifest?: (input: { extensionId: string; version: string }) => Promise<DeepProbeManifest>
  loadMcpFragment?: (input: {
    extensionId: string
    version: string
    mcpFile: string
  }) => Promise<Record<string, unknown>>
  listToolScriptPaths?: (input: {
    extensionId: string
    version: string
    toolsPath: string
  }) => Promise<string[]>
  startMcpCommandProbe?: (input: {
    command: readonly string[]
    startupTimeoutMs: number
  }) => Promise<
    { ok: true; durationMs: number } | { ok: false; reason: string; durationMs: number }
  >
  loadToolModuleProbe?: (filePath: string) => Promise<{ ok: true } | { ok: false; reason: string }>
}

const toolFilePattern = /\.(ts|js|mjs|cjs)$/
const MCP_STARTUP_SHUTDOWN_GRACE_MS = 500

const mcpServerConfigSchema = z
  .object({
    type: z.string().trim().min(1).optional(),
    command: z.array(z.string().trim().min(1)).min(1),
    enabled: z.boolean().default(true),
  })
  .passthrough()

const mcpFragmentSchema = z.record(z.string().trim().min(1), mcpServerConfigSchema)

const deepProbeManifestSchema = z.object({
  id: z.string().trim().min(1),
  version: z.string().trim().min(1),
  payload: z
    .object({
      mcp: z
        .object({
          file: z.string().trim().min(1).optional(),
        })
        .optional(),
      tools: z
        .object({
          path: z.string().trim().min(1),
        })
        .optional(),
    })
    .default({}),
})

type DeepProbeManifest = z.infer<typeof deepProbeManifestSchema>

const resolveOttoHome = (environment: NodeJS.ProcessEnv, explicitOttoHome?: string): string => {
  if (explicitOttoHome && explicitOttoHome.trim().length > 0) {
    return explicitOttoHome
  }

  return environment.OTTO_HOME ?? path.join(os.homedir(), ".otto")
}

const resolveStoreVersionPath = (
  ottoHome: string,
  extensionId: string,
  version: string
): string => {
  return path.join(ottoHome, "extensions", "store", extensionId, version)
}

const resolveRuntimeExtensionToolsPath = (ottoHome: string, extensionId: string): string => {
  return path.join(ottoHome, ".opencode", "tools", "extensions", extensionId)
}

const resolvePathWithinRoot = (rootPath: string, declaredPath: string, field: string): string => {
  const resolvedRoot = path.resolve(rootPath)
  const resolvedTarget = path.resolve(resolvedRoot, declaredPath)
  const isWithinRoot =
    resolvedTarget === resolvedRoot || resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)

  if (!isWithinRoot) {
    throw new Error(`Invalid ${field}: path escapes extension store root`)
  }

  return resolvedTarget
}

const resolveManifestPath = (ottoHome: string, extensionId: string, version: string): string => {
  return path.join(resolveStoreVersionPath(ottoHome, extensionId, version), "manifest.jsonc")
}

const defaultLoadManifest =
  (ottoHome: string) =>
  async (input: { extensionId: string; version: string }): Promise<DeepProbeManifest> => {
    const manifestPath = resolveManifestPath(ottoHome, input.extensionId, input.version)
    const source = await readFile(manifestPath, "utf8")
    const parsed = parseJsonc(source)
    const validated = deepProbeManifestSchema.safeParse(parsed)

    if (!validated.success) {
      throw new Error(`Invalid extension manifest at ${manifestPath}`)
    }

    return validated.data
  }

const defaultLoadMcpFragment =
  (ottoHome: string) =>
  async (input: {
    extensionId: string
    version: string
    mcpFile: string
  }): Promise<Record<string, unknown>> => {
    const storeVersionPath = resolveStoreVersionPath(ottoHome, input.extensionId, input.version)
    const mcpPath = resolvePathWithinRoot(
      storeVersionPath,
      input.mcpFile,
      `payload.mcp.file for '${input.extensionId}@${input.version}'`
    )
    const source = await readFile(mcpPath, "utf8")
    const parsed = parseJsonc(source)

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error(`MCP fragment at ${mcpPath} must be an object`)
    }

    return parsed as Record<string, unknown>
  }

const listToolScriptsRecursive = async (rootPath: string): Promise<string[]> => {
  const entries = await readdir(rootPath, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const absolutePath = path.join(rootPath, entry.name)

    if (entry.isDirectory()) {
      files.push(...(await listToolScriptsRecursive(absolutePath)))
      continue
    }

    if (!entry.isFile()) {
      continue
    }

    if (toolFilePattern.test(entry.name)) {
      files.push(absolutePath)
    }
  }

  return files.sort((left, right) => left.localeCompare(right))
}

const defaultListToolScriptPaths =
  (ottoHome: string) =>
  async (input: { extensionId: string; version: string; toolsPath: string }): Promise<string[]> => {
    const storeVersionPath = resolveStoreVersionPath(ottoHome, input.extensionId, input.version)
    resolvePathWithinRoot(
      storeVersionPath,
      input.toolsPath,
      `payload.tools.path for '${input.extensionId}@${input.version}'`
    )

    const runtimeToolsPath = resolveRuntimeExtensionToolsPath(ottoHome, input.extensionId)

    try {
      await access(runtimeToolsPath, constants.F_OK)
    } catch {
      return []
    }

    return await listToolScriptsRecursive(runtimeToolsPath)
  }

const defaultStartMcpCommandProbe = async (input: {
  command: readonly string[]
  startupTimeoutMs: number
}): Promise<
  { ok: true; durationMs: number } | { ok: false; reason: string; durationMs: number }
> => {
  const startedAt = Date.now()
  const binary = input.command[0]
  const args = input.command.slice(1)

  if (!binary) {
    return {
      ok: false,
      reason: "MCP command is empty",
      durationMs: 0,
    }
  }

  return await new Promise((resolve) => {
    let settled = false
    let startupTimeoutHandle: ReturnType<typeof setTimeout> | null = null
    let forceKillHandle: ReturnType<typeof setTimeout> | null = null
    let startupWindowElapsed = false

    const child = spawn(binary, args, {
      stdio: "ignore",
      env: process.env,
    })

    const settle = (
      result: { ok: true; durationMs: number } | { ok: false; reason: string; durationMs: number }
    ): void => {
      if (settled) {
        return
      }

      settled = true
      if (startupTimeoutHandle) {
        clearTimeout(startupTimeoutHandle)
      }
      if (forceKillHandle) {
        clearTimeout(forceKillHandle)
      }
      resolve(result)
    }

    child.once("error", (error) => {
      settle({
        ok: false,
        reason: error.message,
        durationMs: Math.max(0, Date.now() - startedAt),
      })
    })

    child.once("exit", (code, signal) => {
      if (startupWindowElapsed) {
        settle({
          ok: true,
          durationMs: Math.max(0, Date.now() - startedAt),
        })
        return
      }

      settle({
        ok: false,
        reason: `MCP process exited early (code=${code ?? "null"}, signal=${signal ?? "null"})`,
        durationMs: Math.max(0, Date.now() - startedAt),
      })
    })

    startupTimeoutHandle = setTimeout(
      () => {
        startupWindowElapsed = true
        const termSent = child.kill("SIGTERM")

        if (!termSent) {
          forceKillHandle = setTimeout(() => {
            settle({
              ok: false,
              reason: "Unable to stop MCP process after startup probe timeout",
              durationMs: Math.max(0, Date.now() - startedAt),
            })
          }, MCP_STARTUP_SHUTDOWN_GRACE_MS)

          return
        }

        forceKillHandle = setTimeout(() => {
          const killSent = child.kill("SIGKILL")
          if (!killSent) {
            settle({
              ok: false,
              reason: "Unable to force-stop MCP process after SIGTERM",
              durationMs: Math.max(0, Date.now() - startedAt),
            })
          }
        }, MCP_STARTUP_SHUTDOWN_GRACE_MS)
      },
      Math.max(100, input.startupTimeoutMs)
    )
  })
}

const defaultLoadToolModuleProbe = async (
  filePath: string
): Promise<{ ok: true } | { ok: false; reason: string }> => {
  try {
    const loaded = await import(pathToFileURL(filePath).href)
    const hasDefault = "default" in loaded

    if (!hasDefault) {
      return {
        ok: false,
        reason: "Tool module has no default export",
      }
    }

    return { ok: true }
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown tool module import error"
    return {
      ok: false,
      reason,
    }
  }
}

const toProbeSafeId = (value: string): string => {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/**
 * Builds initial deep live probes for enabled MCP and tool integrations so deep doctor mode can
 * validate real local integration surfaces without running destructive provider mutations.
 */
export const createMcpToolLiveProbes = async (
  dependencies: DeepMcpToolProbeDependencies = {}
): Promise<DoctorLiveProbeDefinition[]> => {
  const environment = dependencies.environment ?? process.env
  const ottoHome = resolveOttoHome(environment, dependencies.ottoHome)
  const listEnabledExtensions =
    dependencies.listEnabledExtensions ??
    (async () => createExtensionStateRepository(ottoHome).listEnabledExtensions())
  const loadManifest = dependencies.loadManifest ?? defaultLoadManifest(ottoHome)
  const loadMcpFragment = dependencies.loadMcpFragment ?? defaultLoadMcpFragment(ottoHome)
  const listToolScriptPaths =
    dependencies.listToolScriptPaths ?? defaultListToolScriptPaths(ottoHome)
  const startMcpCommandProbe = dependencies.startMcpCommandProbe ?? defaultStartMcpCommandProbe
  const loadToolModuleProbe = dependencies.loadToolModuleProbe ?? defaultLoadToolModuleProbe

  const enabled = await listEnabledExtensions()
  const probes: DoctorLiveProbeDefinition[] = []

  for (const extension of enabled) {
    if (!extension.activeVersion || extension.activeVersion.trim().length === 0) {
      continue
    }

    const manifest = await loadManifest({
      extensionId: extension.id,
      version: extension.activeVersion,
    })

    const lockKey = `integration:${manifest.id}`

    if (manifest.payload.mcp?.file) {
      const fragment = await loadMcpFragment({
        extensionId: manifest.id,
        version: manifest.version,
        mcpFile: manifest.payload.mcp.file,
      })
      const parsed = mcpFragmentSchema.safeParse(fragment)

      if (!parsed.success) {
        probes.push({
          id: `probe.mcp.${toProbeSafeId(manifest.id)}.fragment-parse`,
          integrationId: manifest.id,
          mutating: false,
          cleanupRequired: false,
          cleanupGuaranteed: false,
          lockKey,
          execute: async () => {
            return {
              severity: "error",
              summary: "MCP fragment is invalid",
              evidence: [
                {
                  code: "DEEP_MCP_FRAGMENT_INVALID",
                  message: `MCP fragment for '${manifest.id}@${manifest.version}' failed validation`,
                },
              ],
            }
          },
        })
      } else {
        for (const [serverId, serverConfig] of Object.entries(parsed.data)) {
          const normalizedServerId = toProbeSafeId(serverId)
          probes.push({
            id: `probe.mcp.${toProbeSafeId(manifest.id)}.${normalizedServerId}.startup`,
            integrationId: manifest.id,
            mutating: false,
            cleanupRequired: false,
            cleanupGuaranteed: false,
            lockKey,
            precheck: async () => {
              if (serverConfig.enabled === false) {
                return {
                  ok: false,
                  code: "DEEP_MCP_SERVER_DISABLED",
                  reason: `MCP server '${serverId}' is disabled in '${manifest.id}@${manifest.version}'`,
                }
              }

              if (!serverConfig.command[0]) {
                return {
                  ok: false,
                  code: "DEEP_MCP_SERVER_COMMAND_MISSING",
                  reason: `MCP server '${serverId}' has no command configured`,
                }
              }

              return {
                ok: true,
              }
            },
            execute: async () => {
              const startup = await startMcpCommandProbe({
                command: serverConfig.command,
                startupTimeoutMs: 1_500,
              })

              if (!startup.ok) {
                return {
                  severity: "error",
                  summary: `MCP server '${serverId}' failed startup probe`,
                  evidence: [
                    {
                      code: "DEEP_MCP_SERVER_STARTUP_FAILED",
                      message: `Unable to start MCP server '${serverId}' for '${manifest.id}'`,
                      details: {
                        extensionId: manifest.id,
                        extensionVersion: manifest.version,
                        serverId,
                        durationMs: startup.durationMs,
                        reason: startup.reason,
                      },
                    },
                  ],
                }
              }

              return {
                severity: "ok",
                summary: `MCP server '${serverId}' startup probe succeeded`,
                evidence: [
                  {
                    code: "DEEP_MCP_SERVER_STARTUP_OK",
                    message: `MCP server '${serverId}' started and stayed alive for probe window`,
                    details: {
                      extensionId: manifest.id,
                      extensionVersion: manifest.version,
                      serverId,
                      durationMs: startup.durationMs,
                    },
                  },
                ],
              }
            },
          })
        }
      }
    }

    if (manifest.payload.tools?.path) {
      const toolPaths = await listToolScriptPaths({
        extensionId: manifest.id,
        version: manifest.version,
        toolsPath: manifest.payload.tools.path,
      })

      for (const toolPath of toolPaths) {
        const probeName = toProbeSafeId(path.basename(toolPath, path.extname(toolPath)))
        probes.push({
          id: `probe.tool.${toProbeSafeId(manifest.id)}.${probeName}.module-load`,
          integrationId: manifest.id,
          mutating: false,
          cleanupRequired: false,
          cleanupGuaranteed: false,
          lockKey,
          execute: async () => {
            const loaded = await loadToolModuleProbe(toolPath)
            if (!loaded.ok) {
              return {
                severity: "error",
                summary: `Tool module '${path.basename(toolPath)}' failed live load probe`,
                evidence: [
                  {
                    code: "DEEP_TOOL_MODULE_LOAD_FAILED",
                    message: `Tool module '${path.basename(toolPath)}' failed import for '${manifest.id}'`,
                    details: {
                      extensionId: manifest.id,
                      extensionVersion: manifest.version,
                      toolFile: toolPath,
                      reason: loaded.reason,
                    },
                  },
                ],
              }
            }

            return {
              severity: "ok",
              summary: `Tool module '${path.basename(toolPath)}' live load probe succeeded`,
              evidence: [
                {
                  code: "DEEP_TOOL_MODULE_LOAD_OK",
                  message: `Tool module '${path.basename(toolPath)}' imported successfully`,
                  details: {
                    extensionId: manifest.id,
                    extensionVersion: manifest.version,
                    toolFile: toolPath,
                  },
                },
              ],
            }
          },
        })
      }
    }
  }

  return probes
}
