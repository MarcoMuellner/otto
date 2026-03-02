import { readFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

type FastExternalApiEnvironment = NodeJS.ProcessEnv

type FastExternalApiContext = {
  baseUrl: string
  token: string
}

const normalizeExternalApiBaseUrl = (baseUrl: string): string => {
  try {
    const parsed = new URL(baseUrl)
    if (parsed.hostname === "0.0.0.0") {
      parsed.hostname = "127.0.0.1"
    }

    return parsed.toString().replace(/\/$/, "")
  } catch {
    return baseUrl
  }
}

const resolveExternalApiBaseUrl = (environment: FastExternalApiEnvironment): string => {
  const explicitBaseUrl = environment.OTTO_EXTERNAL_API_URL?.trim()
  if (explicitBaseUrl) {
    return normalizeExternalApiBaseUrl(explicitBaseUrl)
  }

  const rawHost = environment.OTTO_EXTERNAL_API_HOST?.trim()
  const host = !rawHost || rawHost === "0.0.0.0" ? "127.0.0.1" : rawHost
  const port = environment.OTTO_EXTERNAL_API_PORT?.trim() || "4190"
  return normalizeExternalApiBaseUrl(`http://${host}:${port}`)
}

const resolveExternalApiToken = async (
  environment: FastExternalApiEnvironment,
  ottoHome: string
): Promise<string> => {
  const explicitToken = environment.OTTO_EXTERNAL_API_TOKEN?.trim()
  if (explicitToken) {
    return explicitToken
  }

  const tokenPath =
    environment.OTTO_EXTERNAL_API_TOKEN_FILE?.trim() ||
    path.join(ottoHome, "secrets", "internal-api.token")

  const source = await readFile(tokenPath, "utf8")
  const token = source.trim()
  if (token.length === 0) {
    throw new Error(`Otto external API token file is empty: ${tokenPath}`)
  }

  return token
}

export const resolveFastExternalApiContext = async (
  environment: FastExternalApiEnvironment = process.env
): Promise<FastExternalApiContext> => {
  const ottoHome = environment.OTTO_HOME ?? path.join(os.homedir(), ".otto")
  const baseUrl = resolveExternalApiBaseUrl(environment)
  const token = await resolveExternalApiToken(environment, ottoHome)

  return {
    baseUrl,
    token,
  }
}
