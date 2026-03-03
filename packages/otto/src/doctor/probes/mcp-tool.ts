import { spawn } from "node:child_process"
import { constants } from "node:fs"
import { access, readFile, readdir } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { parseJsonc } from "otto-extension-sdk"
import { z } from "zod"

import { resolveOttoConfigPath } from "../../config/otto-config.js"
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
  runToolSessionProbe?: (input: {
    integrationId: string
    extensionVersion: string
    toolName: string
    toolPath: string
  }) => Promise<
    | {
        ok: true
        statusCode: "OK" | "TOOL_CALL_FAILED" | "TOOL_VALIDATION_FAILED"
        durationMs: number
        details?: Record<string, unknown>
      }
    | {
        ok: false
        statusCode:
          | "SESSION_CREATE_FAILED"
          | "SESSION_CHAT_FAILED"
          | "SESSION_PROTOCOL_FAILED"
          | "SESSION_DELETE_FAILED"
        reason: string
        durationMs: number
        details?: Record<string, unknown>
      }
  >
}

const toolFilePattern = /\.(ts|js|mjs|cjs)$/
const MCP_STARTUP_SHUTDOWN_GRACE_MS = 500
const TOOL_SESSION_TIMEOUT_MS = 12_000
const DEFAULT_OPENCODE_BASE_URL = "http://127.0.0.1:4096"

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

const toolProbeStatusSchema = z.object({
  doctorProbe: z.literal("tool-live"),
  tool: z.string().trim().min(1),
  statusCode: z.enum(["OK", "TOOL_CALL_FAILED", "TOOL_VALIDATION_FAILED"]),
  details: z.string().trim().optional(),
})

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

const resolveOpencodeBaseUrl = async (environment: NodeJS.ProcessEnv): Promise<string> => {
  const fromEnv = environment.OPENCODE_BASE_URL?.trim()
  if (fromEnv) {
    return fromEnv
  }

  const homeDirectory = environment.HOME?.trim() || os.homedir()
  const configPath = resolveOttoConfigPath(homeDirectory)

  let source: string
  try {
    source = await readFile(configPath, "utf8")
  } catch (error) {
    const fileError = error as NodeJS.ErrnoException
    if (fileError.code === "ENOENT") {
      return DEFAULT_OPENCODE_BASE_URL
    }

    return DEFAULT_OPENCODE_BASE_URL
  }

  const parsed = parseJsonc(source)
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return DEFAULT_OPENCODE_BASE_URL
  }

  const portValue =
    typeof (parsed as { opencode?: { port?: unknown } }).opencode?.port === "number"
      ? (parsed as { opencode?: { port?: number } }).opencode?.port
      : null

  if (
    typeof portValue !== "number" ||
    !Number.isInteger(portValue) ||
    portValue < 1 ||
    portValue > 65535
  ) {
    return DEFAULT_OPENCODE_BASE_URL
  }

  return `http://127.0.0.1:${portValue}`
}

const parseModelSelection = (model: string): { providerId: string; modelId: string } => {
  const slashIndex = model.indexOf("/")
  if (slashIndex <= 0 || slashIndex === model.length - 1) {
    throw new Error(`OpenCode model must be in provider/model format, received: ${model}`)
  }

  return {
    providerId: model.slice(0, slashIndex),
    modelId: model.slice(slashIndex + 1),
  }
}

const toolProbePrompt = (toolName: string): string => {
  return [
    "Otto doctor live probe.",
    `You must call the tool '${toolName}' exactly once using an empty argument object {}.`,
    "Return plain JSON only (no markdown) with this exact schema:",
    `{"doctorProbe":"tool-live","tool":"${toolName}","statusCode":"OK|TOOL_CALL_FAILED|TOOL_VALIDATION_FAILED","details":"short reason"}`,
    "If the call succeeds, use statusCode=OK.",
    "If the call fails due to business/runtime error, use statusCode=TOOL_CALL_FAILED.",
    "If the call fails because required args are missing/invalid, use statusCode=TOOL_VALIDATION_FAILED.",
  ].join("\n")
}

const extractTextParts = (payload: unknown): string => {
  if (typeof payload !== "object" || payload === null) {
    return ""
  }

  const parts = (payload as { parts?: unknown }).parts
  if (!Array.isArray(parts)) {
    return ""
  }

  return parts
    .map((part) => {
      if (typeof part !== "object" || part === null) {
        return ""
      }

      const typed = part as { type?: unknown; text?: unknown }
      if (typed.type !== "text" || typeof typed.text !== "string") {
        return ""
      }

      return typed.text
    })
    .filter((value) => value.length > 0)
    .join("\n")
}

const extractJsonObject = (value: string): string | null => {
  const start = value.indexOf("{")
  const end = value.lastIndexOf("}")
  if (start < 0 || end < start) {
    return null
  }

  return value.slice(start, end + 1)
}

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

const asString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

const fetchJson = async (input: {
  url: string
  method: "GET" | "POST" | "DELETE"
  headers: Record<string, string>
  body?: Record<string, unknown>
}): Promise<unknown> => {
  const response = await fetch(input.url, {
    method: input.method,
    headers: {
      ...input.headers,
      ...(input.body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
  })

  const text = await response.text()
  if (!response.ok) {
    throw new Error(
      `OpenCode endpoint ${input.method} ${input.url} failed (${response.status}): ${
        text || "no response body"
      }`
    )
  }

  if (!text.trim()) {
    return null
  }

  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`OpenCode endpoint ${input.method} ${input.url} returned invalid JSON`)
  }
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

const defaultRunToolSessionProbe =
  (environment: NodeJS.ProcessEnv) =>
  async (input: {
    integrationId: string
    extensionVersion: string
    toolName: string
    toolPath: string
  }): Promise<
    | {
        ok: true
        statusCode: "OK" | "TOOL_CALL_FAILED" | "TOOL_VALIDATION_FAILED"
        durationMs: number
        details?: Record<string, unknown>
      }
    | {
        ok: false
        statusCode:
          | "SESSION_CREATE_FAILED"
          | "SESSION_CHAT_FAILED"
          | "SESSION_PROTOCOL_FAILED"
          | "SESSION_DELETE_FAILED"
        reason: string
        durationMs: number
        details?: Record<string, unknown>
      }
  > => {
    const startedAt = Date.now()
    const baseUrl = await resolveOpencodeBaseUrl(environment)

    const authToken = environment.OPENCODE_AUTH_TOKEN?.trim()
    const headers: Record<string, string> = authToken
      ? {
          authorization: `Bearer ${authToken}`,
        }
      : {}

    let sessionId: string | null = null

    try {
      const createdPayload = await fetchJson({
        url: `${baseUrl}/session`,
        method: "POST",
        headers,
        body: {
          title: `doctor probe ${input.integrationId}/${input.toolName}`,
        },
      })
      const createdRecord = asRecord(createdPayload)
      const createdDataRecord = createdRecord ? asRecord(createdRecord.data) : null
      sessionId = asString(createdRecord?.id) ?? asString(createdDataRecord?.id)
      if (!sessionId) {
        return {
          ok: false,
          statusCode: "SESSION_CREATE_FAILED",
          reason: "OpenCode session creation did not return an id",
          durationMs: Math.max(0, Date.now() - startedAt),
          details: {
            integrationId: input.integrationId,
            extensionVersion: input.extensionVersion,
            toolName: input.toolName,
            toolPath: input.toolPath,
          },
        }
      }

      const configPayload = await fetchJson({
        url: `${baseUrl}/config`,
        method: "GET",
        headers,
      })
      const configRecord = asRecord(configPayload)
      const configDataRecord = configRecord ? asRecord(configRecord.data) : null
      const configuredModel = asString(configRecord?.model) ?? asString(configDataRecord?.model)
      if (!configuredModel) {
        return {
          ok: false,
          statusCode: "SESSION_CHAT_FAILED",
          reason: "OpenCode config is missing a default model",
          durationMs: Math.max(0, Date.now() - startedAt),
        }
      }

      const model = parseModelSelection(configuredModel)

      const chatPromise = fetchJson({
        url: `${baseUrl}/session/${encodeURIComponent(sessionId)}/chat`,
        method: "POST",
        headers,
        body: {
          providerID: model.providerId,
          modelID: model.modelId,
          parts: [
            {
              type: "text",
              text: toolProbePrompt(input.toolName),
            },
          ],
          tools: {
            [input.toolName]: true,
          },
        },
      })

      const timedChatPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Tool session probe timed out after ${TOOL_SESSION_TIMEOUT_MS}ms`))
        }, TOOL_SESSION_TIMEOUT_MS)
      })

      const chatPayload = await Promise.race([chatPromise, timedChatPromise])
      const chatRecord = asRecord(chatPayload)
      const responseData = chatRecord && "data" in chatRecord ? chatRecord.data : chatPayload
      const responseText = extractTextParts(responseData)
      const jsonSlice = extractJsonObject(responseText)
      if (!jsonSlice) {
        return {
          ok: false,
          statusCode: "SESSION_PROTOCOL_FAILED",
          reason: "Tool session probe did not return JSON result",
          durationMs: Math.max(0, Date.now() - startedAt),
          details: {
            integrationId: input.integrationId,
            extensionVersion: input.extensionVersion,
            toolName: input.toolName,
            toolPath: input.toolPath,
            responseText,
          },
        }
      }

      const parsedJson = JSON.parse(jsonSlice)
      const parsed = toolProbeStatusSchema.safeParse(parsedJson)
      if (!parsed.success) {
        return {
          ok: false,
          statusCode: "SESSION_PROTOCOL_FAILED",
          reason: "Tool session probe returned invalid status payload",
          durationMs: Math.max(0, Date.now() - startedAt),
          details: {
            integrationId: input.integrationId,
            extensionVersion: input.extensionVersion,
            toolName: input.toolName,
            toolPath: input.toolPath,
            responseJson: parsedJson,
          },
        }
      }

      if (parsed.data.tool !== input.toolName) {
        return {
          ok: false,
          statusCode: "SESSION_PROTOCOL_FAILED",
          reason: `Tool session probe returned mismatched tool '${parsed.data.tool}' (expected '${input.toolName}')`,
          durationMs: Math.max(0, Date.now() - startedAt),
          details: {
            integrationId: input.integrationId,
            extensionVersion: input.extensionVersion,
            toolName: input.toolName,
            toolPath: input.toolPath,
            responseJson: parsedJson,
          },
        }
      }

      return {
        ok: true,
        statusCode: parsed.data.statusCode,
        durationMs: Math.max(0, Date.now() - startedAt),
        details: {
          integrationId: input.integrationId,
          extensionVersion: input.extensionVersion,
          toolName: input.toolName,
          toolPath: input.toolPath,
          responseDetails: parsed.data.details ?? null,
        },
      }
    } catch (error) {
      const err = error as Error
      return {
        ok: false,
        statusCode: "SESSION_CHAT_FAILED",
        reason: err.message,
        durationMs: Math.max(0, Date.now() - startedAt),
        details: {
          integrationId: input.integrationId,
          extensionVersion: input.extensionVersion,
          toolName: input.toolName,
          toolPath: input.toolPath,
        },
      }
    } finally {
      if (sessionId) {
        try {
          await fetch(`${baseUrl}/session/${encodeURIComponent(sessionId)}/abort`, {
            method: "POST",
            headers,
          })
          await fetch(`${baseUrl}/session/${encodeURIComponent(sessionId)}`, {
            method: "DELETE",
            headers,
          })
        } catch {
          // Best-effort oneshot cleanup only.
        }
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
  const runToolSessionProbe =
    dependencies.runToolSessionProbe ?? defaultRunToolSessionProbe(environment)

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
          id: `probe.tool.${toProbeSafeId(manifest.id)}.${probeName}.oneshot-session`,
          integrationId: manifest.id,
          mutating: false,
          cleanupRequired: false,
          cleanupGuaranteed: false,
          lockKey,
          execute: async () => {
            const sessionProbe = await runToolSessionProbe({
              integrationId: manifest.id,
              extensionVersion: manifest.version,
              toolName: path.basename(toolPath, path.extname(toolPath)),
              toolPath,
            })

            if (!sessionProbe.ok) {
              return {
                severity: "error",
                summary: `Tool '${path.basename(toolPath)}' failed one-shot OpenCode session probe`,
                evidence: [
                  {
                    code: "DEEP_TOOL_SESSION_PROBE_FAILED",
                    message: `Tool '${path.basename(toolPath)}' failed OpenCode session probe for '${manifest.id}'`,
                    details: {
                      extensionId: manifest.id,
                      extensionVersion: manifest.version,
                      toolFile: toolPath,
                      statusCode: sessionProbe.statusCode,
                      reason: sessionProbe.reason,
                      durationMs: sessionProbe.durationMs,
                      ...(sessionProbe.details ? { probeDetails: sessionProbe.details } : {}),
                    },
                  },
                ],
              }
            }

            if (sessionProbe.statusCode !== "OK") {
              const isValidationIssue = sessionProbe.statusCode === "TOOL_VALIDATION_FAILED"
              return {
                severity: isValidationIssue ? "warning" : "error",
                summary: `Tool '${path.basename(toolPath)}' returned ${sessionProbe.statusCode} in one-shot session probe`,
                evidence: [
                  {
                    code: "DEEP_TOOL_SESSION_STATUS_NON_OK",
                    message: `Tool '${path.basename(toolPath)}' reported ${sessionProbe.statusCode}`,
                    details: {
                      extensionId: manifest.id,
                      extensionVersion: manifest.version,
                      toolFile: toolPath,
                      statusCode: sessionProbe.statusCode,
                      durationMs: sessionProbe.durationMs,
                      ...(sessionProbe.details ? { probeDetails: sessionProbe.details } : {}),
                    },
                  },
                ],
              }
            }

            return {
              severity: "ok",
              summary: `Tool '${path.basename(toolPath)}' one-shot OpenCode session probe succeeded`,
              evidence: [
                {
                  code: "DEEP_TOOL_SESSION_PROBE_OK",
                  message: `Tool '${path.basename(toolPath)}' executed through OpenCode one-shot session`,
                  details: {
                    extensionId: manifest.id,
                    extensionVersion: manifest.version,
                    toolFile: toolPath,
                    statusCode: sessionProbe.statusCode,
                    durationMs: sessionProbe.durationMs,
                    ...(sessionProbe.details ? { probeDetails: sessionProbe.details } : {}),
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
