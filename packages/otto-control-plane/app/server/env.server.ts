import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"

import { z } from "zod"

const DEFAULT_EXTERNAL_API_BASE_URL = "http://127.0.0.1:4190"

const environmentSchema = z.object({
  OTTO_EXTERNAL_API_URL: z.string().trim().url().optional(),
  OTTO_EXTERNAL_API_TOKEN: z.string().trim().min(1).optional(),
  OTTO_EXTERNAL_API_TOKEN_FILE: z.string().trim().min(1).optional(),
})

export type ControlPlaneServerConfig = {
  externalApiBaseUrl: string
  externalApiToken: string
}

type ResolveControlPlaneServerConfigInput = {
  environment?: NodeJS.ProcessEnv
  homeDirectory?: string
  readTokenFile?: (tokenPath: string) => Promise<string>
}

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

/**
 * Resolves server-only control-plane runtime configuration so browser bundles never receive
 * Otto API secrets while still supporting flexible local deployment wiring.
 *
 * @param input Optional environment, home directory, and token-file reader overrides for tests.
 * @returns External API base URL and bearer token for server-side BFF calls.
 */
export const resolveControlPlaneServerConfig = async (
  input: ResolveControlPlaneServerConfigInput = {}
): Promise<ControlPlaneServerConfig> => {
  const environment = input.environment ?? process.env
  const homeDirectory = input.homeDirectory ?? homedir()
  const readToken = input.readTokenFile ?? readTokenFromFile
  const parsedEnvironment = environmentSchema.parse(environment)

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
