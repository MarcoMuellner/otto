import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"

import { z } from "zod"

const DEFAULT_EXTERNAL_API_BASE_URL = "http://127.0.0.1:4190"
const DEFAULT_ENV_FILE_NAME = ".env"

const environmentSchema = z.object({
  OTTO_EXTERNAL_API_URL: z.string().trim().url().optional(),
  OTTO_EXTERNAL_API_TOKEN: z.string().trim().min(1).optional(),
  OTTO_EXTERNAL_API_TOKEN_FILE: z.string().trim().min(1).optional(),
})

type EnvironmentKeys = keyof z.infer<typeof environmentSchema>

export type ControlPlaneServerConfig = {
  externalApiBaseUrl: string
  externalApiToken: string
}

type ResolveControlPlaneServerConfigInput = {
  environment?: NodeJS.ProcessEnv
  homeDirectory?: string
  cwd?: string
  readTokenFile?: (tokenPath: string) => Promise<string>
  readEnvironmentFile?: (envPath: string) => Promise<string>
}

type EnvironmentValues = Partial<Record<EnvironmentKeys, string>>

const buildDefaultTokenPath = (homeDirectory: string): string => {
  return path.join(homeDirectory, ".otto", "secrets", "internal-api.token")
}

const readTokenFromFile = async (tokenPath: string): Promise<string> => {
  const raw = await readFile(tokenPath, "utf8")
  const token = raw.trim()

  if (token.length === 0) {
    throw new Error(`Otto external API token file is empty: ${tokenPath}`)
  }

  return token
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
        key === "OTTO_EXTERNAL_API_URL" ||
        key === "OTTO_EXTERNAL_API_TOKEN" ||
        key === "OTTO_EXTERNAL_API_TOKEN_FILE"
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
  const envPath = path.join(currentWorkingDirectory, DEFAULT_ENV_FILE_NAME)

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

const resolveEnvironmentValues = (
  fromDotEnv: EnvironmentValues,
  fromProcessEnvironment: NodeJS.ProcessEnv
): EnvironmentValues => {
  return {
    OTTO_EXTERNAL_API_URL: firstNonEmpty(
      fromDotEnv.OTTO_EXTERNAL_API_URL,
      fromProcessEnvironment.OTTO_EXTERNAL_API_URL
    ),
    OTTO_EXTERNAL_API_TOKEN: firstNonEmpty(
      fromDotEnv.OTTO_EXTERNAL_API_TOKEN,
      fromProcessEnvironment.OTTO_EXTERNAL_API_TOKEN
    ),
    OTTO_EXTERNAL_API_TOKEN_FILE: firstNonEmpty(
      fromDotEnv.OTTO_EXTERNAL_API_TOKEN_FILE,
      fromProcessEnvironment.OTTO_EXTERNAL_API_TOKEN_FILE
    ),
  }
}

/**
 * Resolves server-only control-plane runtime configuration so browser bundles never receive
 * Otto API secrets while still supporting flexible local deployment wiring.
 *
 * Resolution order:
 * 1) local `.env` values (when file exists)
 * 2) process environment values
 * 3) fallback defaults/token-file resolution
 *
 * @param input Optional environment, home directory, and file reader overrides for tests.
 * @returns External API base URL and bearer token for server-side BFF calls.
 */
export const resolveControlPlaneServerConfig = async (
  input: ResolveControlPlaneServerConfigInput = {}
): Promise<ControlPlaneServerConfig> => {
  const environment = input.environment ?? process.env
  const homeDirectory = input.homeDirectory ?? homedir()
  const currentWorkingDirectory = input.cwd ?? process.cwd()
  const readToken = input.readTokenFile ?? readTokenFromFile
  const readEnvironmentFile =
    input.readEnvironmentFile ?? ((envPath: string) => readFile(envPath, "utf8"))

  const dotEnvValues = await readEnvironmentValuesFromDotEnv(
    currentWorkingDirectory,
    readEnvironmentFile
  )

  const mergedEnvironment = resolveEnvironmentValues(dotEnvValues, environment)
  const parsedEnvironment = environmentSchema.parse(mergedEnvironment)
  const externalApiBaseUrl =
    parsedEnvironment.OTTO_EXTERNAL_API_URL ?? DEFAULT_EXTERNAL_API_BASE_URL

  if (parsedEnvironment.OTTO_EXTERNAL_API_TOKEN) {
    return {
      externalApiBaseUrl,
      externalApiToken: parsedEnvironment.OTTO_EXTERNAL_API_TOKEN,
    }
  }

  const tokenPath =
    parsedEnvironment.OTTO_EXTERNAL_API_TOKEN_FILE ?? buildDefaultTokenPath(homeDirectory)

  return {
    externalApiBaseUrl,
    externalApiToken: await readToken(tokenPath),
  }
}

let cachedConfigPromise: Promise<ControlPlaneServerConfig> | null = null

/**
 * Reuses one validated config snapshot per process so route loaders avoid repeated filesystem
 * token reads while preserving server-only secret access boundaries.
 *
 * @returns Cached control-plane server config promise.
 */
export const resolveCachedControlPlaneServerConfig = (): Promise<ControlPlaneServerConfig> => {
  if (!cachedConfigPromise) {
    cachedConfigPromise = resolveControlPlaneServerConfig()
  }

  return cachedConfigPromise
}

export const resetCachedControlPlaneServerConfigForTests = (): void => {
  cachedConfigPromise = null
}
