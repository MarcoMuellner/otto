import { homedir } from "node:os"
import path from "node:path"
import { mkdir, readFile, writeFile } from "node:fs/promises"

export type OttoConfig = {
  version: 1
  ottoHome: string
  opencode: {
    hostname: string
    port: number
  }
}

export type ResolvedOttoConfig = {
  config: OttoConfig
  configPath: string
  created: boolean
}

const CONFIG_RELATIVE_PATH = path.join(".config", "otto", "config.jsonc")

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null
}

export const resolveOttoConfigPath = (homeDirectory = homedir()): string => {
  return path.join(homeDirectory, CONFIG_RELATIVE_PATH)
}

export const buildDefaultOttoConfig = (homeDirectory = homedir()): OttoConfig => {
  return {
    version: 1,
    ottoHome: path.join(homeDirectory, ".otto"),
    opencode: {
      hostname: "0.0.0.0",
      port: 4096,
    },
  }
}

const parseOttoConfig = (source: string, configPath: string): OttoConfig => {
  let parsed: unknown

  try {
    parsed = JSON.parse(source)
  } catch {
    throw new Error(`Invalid JSON in Otto config: ${configPath}`)
  }

  if (!isRecord(parsed)) {
    throw new Error(`Otto config must be an object: ${configPath}`)
  }

  const { version, ottoHome, opencode } = parsed

  if (version !== 1) {
    throw new Error(`Unsupported Otto config version in ${configPath}`)
  }

  if (typeof ottoHome !== "string" || ottoHome.length === 0) {
    throw new Error(`Config field "ottoHome" must be a non-empty string: ${configPath}`)
  }

  if (!isRecord(opencode)) {
    throw new Error(`Config field "opencode" must be an object: ${configPath}`)
  }

  const hostname = opencode.hostname
  const port = opencode.port

  if (typeof hostname !== "string" || hostname.length === 0) {
    throw new Error(`Config field "opencode.hostname" must be a non-empty string: ${configPath}`)
  }

  if (typeof port !== "number" || !Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Config field "opencode.port" must be a valid TCP port: ${configPath}`)
  }

  return {
    version: 1,
    ottoHome,
    opencode: {
      hostname,
      port,
    },
  }
}

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
