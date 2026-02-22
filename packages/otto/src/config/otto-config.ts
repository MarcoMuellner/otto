import { homedir } from "node:os"
import path from "node:path"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { z } from "zod"
import { parseJsonc } from "otto-extension-sdk"

import {
  DEFAULT_MODEL_FLOW_DEFAULTS,
  modelFlowDefaultsSchema as sharedModelFlowDefaultsSchema,
} from "../model-management/contracts.js"

const DEFAULT_TELEGRAM_VOICE_SETTINGS = {
  enabled: false,
  maxDurationSec: 180,
  maxBytes: 10 * 1024 * 1024,
  downloadTimeoutMs: 20_000,
}

const DEFAULT_TELEGRAM_TRANSCRIPTION_SETTINGS = {
  provider: "command" as "command" | "http" | "worker",
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
}

const telegramVoiceSettingsSchema = z
  .object({
    enabled: z.boolean().default(false),
    maxDurationSec: z.number().int().min(1).default(180),
    maxBytes: z
      .number()
      .int()
      .min(1_024)
      .default(10 * 1024 * 1024),
    downloadTimeoutMs: z.number().int().min(1_000).default(20_000),
  })
  .default(DEFAULT_TELEGRAM_VOICE_SETTINGS)

const telegramTranscriptionSettingsSchema = z
  .object({
    provider: z.enum(["command", "http", "worker"]).default("command"),
    timeoutMs: z.number().int().min(5_000).default(300_000),
    workerStartupTimeoutMs: z.number().int().min(5_000).default(600_000),
    language: z.string().min(1).default("auto"),
    model: z.string().min(1).default("small"),
    command: z.string().min(1).nullable().default(null),
    commandArgs: z.array(z.string()).default(["{input}"]),
    workerScriptPath: z.string().min(1).nullable().default(null),
    workerPythonPath: z.string().min(1).nullable().default(null),
    baseUrl: z.string().url().default("http://127.0.0.1:9000"),
    httpPath: z.string().min(1).default("/v1/audio/transcriptions"),
  })
  .default(DEFAULT_TELEGRAM_TRANSCRIPTION_SETTINGS)

const telegramSettingsSchema = z
  .object({
    voice: telegramVoiceSettingsSchema,
    transcription: telegramTranscriptionSettingsSchema,
  })
  .default({
    voice: DEFAULT_TELEGRAM_VOICE_SETTINGS,
    transcription: DEFAULT_TELEGRAM_TRANSCRIPTION_SETTINGS,
  })

const modelFlowDefaultsSchema = sharedModelFlowDefaultsSchema.default({
  ...DEFAULT_MODEL_FLOW_DEFAULTS,
})

const modelManagementSettingsSchema = z
  .object({
    flowDefaults: modelFlowDefaultsSchema,
  })
  .default({
    flowDefaults: {
      ...DEFAULT_MODEL_FLOW_DEFAULTS,
    },
  })

const ottoConfigSchema = z.object({
  version: z.literal(1),
  ottoHome: z.string().min(1, "ottoHome must be a non-empty string"),
  opencode: z.object({
    hostname: z.string().min(1, "opencode.hostname must be a non-empty string"),
    port: z
      .number()
      .int("opencode.port must be an integer")
      .min(1, "opencode.port must be >= 1")
      .max(65535, "opencode.port must be <= 65535"),
  }),
  telegram: telegramSettingsSchema,
  modelManagement: modelManagementSettingsSchema,
})

export type OttoConfig = z.infer<typeof ottoConfigSchema>
export type OttoTelegramSettings = OttoConfig["telegram"]
export type OttoModelFlowDefaults = OttoConfig["modelManagement"]["flowDefaults"]

export type ResolvedOttoConfig = {
  config: OttoConfig
  configPath: string
  created: boolean
}

const CONFIG_RELATIVE_PATH = path.join(".config", "otto", "config.jsonc")

/**
 * Anchors Otto config under a standard user config location so customization survives
 * upgrades and does not depend on current working directory.
 *
 * @param homeDirectory Home directory override used by tests and custom runtimes.
 * @returns Absolute path to Otto's persistent config file.
 */
export const resolveOttoConfigPath = (homeDirectory = homedir()): string => {
  return path.join(homeDirectory, CONFIG_RELATIVE_PATH)
}

/**
 * Provides a known-good baseline so first boot is functional without manual setup,
 * while still allowing users to edit the generated file afterward.
 *
 * @param homeDirectory Home directory override used by tests and custom runtimes.
 * @returns Default Otto configuration payload.
 */
export const buildDefaultOttoConfig = (homeDirectory = homedir()): OttoConfig => {
  return {
    version: 1,
    ottoHome: path.join(homeDirectory, ".otto"),
    opencode: {
      hostname: "0.0.0.0",
      port: 4096,
    },
    telegram: {
      voice: { ...DEFAULT_TELEGRAM_VOICE_SETTINGS },
      transcription: {
        ...DEFAULT_TELEGRAM_TRANSCRIPTION_SETTINGS,
        commandArgs: [...DEFAULT_TELEGRAM_TRANSCRIPTION_SETTINGS.commandArgs],
      },
    },
    modelManagement: {
      flowDefaults: {
        ...DEFAULT_MODEL_FLOW_DEFAULTS,
      },
    },
  }
}

/**
 * Reads current runtime model flow defaults from persisted Otto config so API and operator
 * surfaces can display effective defaults without reimplementing config resolution.
 *
 * @param homeDirectory Home directory override used by tests and embedding.
 * @param configPath Optional explicit config path for advanced embedding scenarios.
 * @returns Current persisted flow default mapping.
 */
export const readOttoModelFlowDefaults = async (
  homeDirectory = homedir(),
  configPath = resolveOttoConfigPath(homeDirectory)
): Promise<OttoModelFlowDefaults> => {
  const { config } = await ensureOttoConfigFile(homeDirectory, configPath)
  return {
    ...config.modelManagement.flowDefaults,
  }
}

/**
 * Persists new model flow defaults atomically through the same config schema used at startup
 * so runtime config edits remain validated and immediately visible to active services.
 *
 * @param flowDefaults Flow defaults to persist.
 * @param homeDirectory Home directory override used by tests and embedding.
 * @param configPath Optional explicit config path for advanced embedding scenarios.
 * @returns Updated persisted config.
 */
export const updateOttoModelFlowDefaults = async (
  flowDefaults: OttoModelFlowDefaults,
  homeDirectory = homedir(),
  configPath = resolveOttoConfigPath(homeDirectory)
): Promise<OttoConfig> => {
  const { config: existing } = await ensureOttoConfigFile(homeDirectory, configPath)
  const updated = ottoConfigSchema.parse({
    ...existing,
    modelManagement: {
      flowDefaults,
    },
  })

  await mkdir(path.dirname(configPath), { recursive: true })
  await writeFile(configPath, `${JSON.stringify(updated, null, 2)}\n`, "utf8")

  await syncOpencodeGlobalDefaultModel(updated.ottoHome, flowDefaults.interactiveAssistant)

  return updated
}

/**
 * Mirrors interactive-assistant default model into OpenCode config so freshly created UI sessions
 * show and use the same global default the Otto model resolver falls back to.
 *
 * @param ottoHome Runtime Otto home path containing opencode.jsonc.
 * @param modelRef Interactive assistant model reference or null for inherit mode.
 */
const syncOpencodeGlobalDefaultModel = async (
  ottoHome: string,
  modelRef: string | null
): Promise<void> => {
  if (modelRef === null) {
    return
  }

  const opencodeConfigPath = path.join(ottoHome, "opencode.jsonc")

  let source: string
  try {
    source = await readFile(opencodeConfigPath, "utf8")
  } catch (error) {
    const fileError = error as NodeJS.ErrnoException
    if (fileError.code === "ENOENT") {
      return
    }

    throw error
  }

  const parsed = parseJsonc(source)
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`OpenCode config at ${opencodeConfigPath} must be an object`)
  }

  const config = { ...(parsed as Record<string, unknown>) }
  config.model = modelRef

  if (typeof config.agent === "object" && config.agent !== null && !Array.isArray(config.agent)) {
    const agent = { ...(config.agent as Record<string, unknown>) }
    const assistant = agent.assistant
    if (typeof assistant === "object" && assistant !== null && !Array.isArray(assistant)) {
      agent.assistant = {
        ...(assistant as Record<string, unknown>),
        model: modelRef,
      }
      config.agent = agent
    }
  }

  await writeFile(opencodeConfigPath, `${JSON.stringify(config, null, 2)}\n`, "utf8")
}

/**
 * Validates persisted config with a single schema so runtime behavior and TypeScript
 * types stay aligned as the config evolves.
 *
 * @param source Raw config file contents.
 * @param configPath Path included in error messages for fast debugging.
 * @returns Validated Otto config object.
 */
const parseOttoConfig = (source: string, configPath: string): OttoConfig => {
  let parsed: unknown

  try {
    parsed = JSON.parse(source)
  } catch {
    throw new Error(`Invalid JSON in Otto config: ${configPath}`)
  }

  const validated = ottoConfigSchema.safeParse(parsed)

  if (!validated.success) {
    const detail = validated.error.issues
      .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
      .join("; ")

    throw new Error(`Invalid Otto config in ${configPath}: ${detail}`)
  }

  return validated.data
}

/**
 * Guarantees a persistent, validated config exists before runtime work starts so startup
 * failures are actionable and deterministic.
 *
 * @param homeDirectory Home directory override used by tests and custom runtimes.
 * @param configPath Optional explicit config path for advanced embedding scenarios.
 * @returns Loaded or newly created Otto config metadata.
 */
export const ensureOttoConfigFile = async (
  homeDirectory = homedir(),
  configPath = resolveOttoConfigPath(homeDirectory)
): Promise<ResolvedOttoConfig> => {
  try {
    const existing = await readFile(configPath, "utf8")

    return {
      config: parseOttoConfig(existing, configPath),
      configPath,
      created: false,
    }
  } catch (error) {
    const err = error as NodeJS.ErrnoException

    if (err.code !== "ENOENT") {
      throw error
    }
  }

  const defaults = buildDefaultOttoConfig(homeDirectory)

  await mkdir(path.dirname(configPath), { recursive: true })
  await writeFile(configPath, `${JSON.stringify(defaults, null, 2)}\n`, "utf8")

  return {
    config: defaults,
    configPath,
    created: true,
  }
}
