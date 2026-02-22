import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"

import { z } from "zod"

const DEFAULT_OPENCODE_API_URL = "http://127.0.0.1:4096"
const DEFAULT_DOT_ENV_FILE_NAME = ".env"
const DEFAULT_OTTO_CONFIG_RELATIVE_PATH = path.join(".config", "otto", "config.jsonc")

const environmentSchema = z.object({
  OTTO_OPENCODE_API_URL: z.string().trim().url().optional(),
  OTTO_EXTERNAL_API_URL: z.string().trim().url().optional(),
  OTTO_STATE_DB_PATH: z.string().trim().min(1).optional(),
})

type EnvironmentKeys = keyof z.infer<typeof environmentSchema>
type EnvironmentValues = Partial<Record<EnvironmentKeys, string>>

type OttoConfigDefaults = {
  opencodeApiUrl: string
  opencodePort: number
  stateDatabasePath: string
}

export type ControlPlaneChatConfig = {
  opencodeApiUrl: string
  stateDatabasePath: string
}

type ResolveControlPlaneChatConfigInput = {
  environment?: NodeJS.ProcessEnv
  homeDirectory?: string
  cwd?: string
  readEnvironmentFile?: (envPath: string) => Promise<string>
  readOttoConfigFile?: (configPath: string) => Promise<string>
}

const firstNonEmpty = (...values: Array<string | undefined>): string | undefined => {
  for (const value of values) {
    if (typeof value !== "string") {
      continue
    }

    const trimmed = value.trim()
    if (trimmed.length > 0) {
      return trimmed
    }
  }

  return undefined
}

const parseEnvironmentFile = (source: string): EnvironmentValues => {
  const values: EnvironmentValues = {}

  for (const line of source.split(/\r?\n/u)) {
    const trimmed = line.trim()
    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue
    }

    const separator = trimmed.indexOf("=")
    if (separator < 1) {
      continue
    }

    const key = trimmed.slice(0, separator).trim()
    const value = trimmed.slice(separator + 1).trim()

    if (
      !(
        key === "OTTO_OPENCODE_API_URL" ||
        key === "OTTO_EXTERNAL_API_URL" ||
        key === "OTTO_STATE_DB_PATH"
      )
    ) {
      continue
    }

    const normalized =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
        ? value.slice(1, -1).trim()
        : value

    values[key] = normalized
  }

  return values
}

const readEnvironmentValuesFromDotEnv = async (
  currentWorkingDirectory: string,
  readEnvironmentFile: (envPath: string) => Promise<string>
): Promise<EnvironmentValues> => {
  const envPath = path.join(currentWorkingDirectory, DEFAULT_DOT_ENV_FILE_NAME)

  try {
    const source = await readEnvironmentFile(envPath)
    return parseEnvironmentFile(source)
  } catch (error) {
    const err = error as NodeJS.ErrnoException
    if (err.code === "ENOENT") {
      return {}
    }

    throw error
  }
}

const resolveEnvironmentValues = (
  fromDotEnv: EnvironmentValues,
  fromProcessEnvironment: NodeJS.ProcessEnv
): EnvironmentValues => {
  return {
    OTTO_OPENCODE_API_URL: firstNonEmpty(
      fromDotEnv.OTTO_OPENCODE_API_URL,
      fromProcessEnvironment.OTTO_OPENCODE_API_URL
    ),
    OTTO_EXTERNAL_API_URL: firstNonEmpty(
      fromDotEnv.OTTO_EXTERNAL_API_URL,
      fromProcessEnvironment.OTTO_EXTERNAL_API_URL
    ),
    OTTO_STATE_DB_PATH: firstNonEmpty(
      fromDotEnv.OTTO_STATE_DB_PATH,
      fromProcessEnvironment.OTTO_STATE_DB_PATH
    ),
  }
}

const deriveOpencodeApiUrlFromExternalApi = (
  externalApiUrl: string | undefined,
  opencodePort: number
): string | undefined => {
  if (!externalApiUrl) {
    return undefined
  }

  try {
    const parsed = new URL(externalApiUrl)
    const hostname = normalizeHostnameForClient(parsed.hostname)

    return `${parsed.protocol}//${hostname}:${opencodePort}`
  } catch {
    return undefined
  }
}

const normalizeHostnameForClient = (hostname: string): string => {
  if (hostname === "0.0.0.0" || hostname === "::") {
    return "127.0.0.1"
  }

  return hostname
}

const resolveOttoConfigDefaults = async (
  homeDirectory: string,
  readOttoConfigFile: (configPath: string) => Promise<string>
): Promise<OttoConfigDefaults> => {
  const fallbackStateDatabasePath = path.join(homeDirectory, ".otto", "data", "otto-state.db")
  const fallback: OttoConfigDefaults = {
    opencodeApiUrl: DEFAULT_OPENCODE_API_URL,
    opencodePort: 4096,
    stateDatabasePath: fallbackStateDatabasePath,
  }

  const configPath = path.join(homeDirectory, DEFAULT_OTTO_CONFIG_RELATIVE_PATH)

  try {
    const rawConfig = await readOttoConfigFile(configPath)
    const parsed = JSON.parse(rawConfig) as unknown

    if (typeof parsed !== "object" || parsed === null) {
      return fallback
    }

    const candidate = parsed as {
      ottoHome?: unknown
      opencode?: {
        hostname?: unknown
        port?: unknown
      }
    }

    const ottoHome =
      typeof candidate.ottoHome === "string" && candidate.ottoHome.trim().length > 0
        ? candidate.ottoHome.trim()
        : path.join(homeDirectory, ".otto")

    const hostname = candidate.opencode?.hostname
    const port = candidate.opencode?.port
    const hasValidOpencode =
      typeof hostname === "string" &&
      hostname.trim().length > 0 &&
      typeof port === "number" &&
      Number.isInteger(port) &&
      port >= 1 &&
      port <= 65535

    return {
      opencodeApiUrl: hasValidOpencode
        ? `http://${normalizeHostnameForClient(hostname.trim())}:${port}`
        : fallback.opencodeApiUrl,
      opencodePort: hasValidOpencode ? port : fallback.opencodePort,
      stateDatabasePath: path.join(ottoHome, "data", "otto-state.db"),
    }
  } catch {
    return fallback
  }
}

/**
 * Resolves control-plane chat integration config from local env and Otto defaults so OpenCode
 * and session-binding access remain server-only and deterministic.
 */
export const resolveControlPlaneChatConfig = async (
  input: ResolveControlPlaneChatConfigInput = {}
): Promise<ControlPlaneChatConfig> => {
  const environment = input.environment ?? process.env
  const homeDirectory = input.homeDirectory ?? homedir()
  const currentWorkingDirectory = input.cwd ?? process.cwd()
  const readEnvironmentFile =
    input.readEnvironmentFile ?? ((envPath: string) => readFile(envPath, "utf8"))
  const readOttoConfigFile =
    input.readOttoConfigFile ?? ((configPath: string) => readFile(configPath, "utf8"))

  const dotEnvValues = await readEnvironmentValuesFromDotEnv(
    currentWorkingDirectory,
    readEnvironmentFile
  )
  const mergedEnvironment = resolveEnvironmentValues(dotEnvValues, environment)
  const parsedEnvironment = environmentSchema.parse(mergedEnvironment)

  const defaults = await resolveOttoConfigDefaults(homeDirectory, readOttoConfigFile)
  const opencodeUrlFromExternal = deriveOpencodeApiUrlFromExternalApi(
    parsedEnvironment.OTTO_EXTERNAL_API_URL,
    defaults.opencodePort
  )

  return {
    opencodeApiUrl:
      parsedEnvironment.OTTO_OPENCODE_API_URL ?? opencodeUrlFromExternal ?? defaults.opencodeApiUrl,
    stateDatabasePath: parsedEnvironment.OTTO_STATE_DB_PATH ?? defaults.stateDatabasePath,
  }
}

let cachedConfigPromise: Promise<ControlPlaneChatConfig> | null = null

export const resolveCachedControlPlaneChatConfig = (): Promise<ControlPlaneChatConfig> => {
  if (!cachedConfigPromise) {
    cachedConfigPromise = resolveControlPlaneChatConfig()
  }

  return cachedConfigPromise
}

export const resetCachedControlPlaneChatConfigForTests = (): void => {
  cachedConfigPromise = null
}
