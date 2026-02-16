import { homedir } from "node:os"
import path from "node:path"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { z } from "zod"

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
})

export type OttoConfig = z.infer<typeof ottoConfigSchema>

export type ResolvedOttoConfig = {
  config: OttoConfig
  configPath: string
  created: boolean
}

const CONFIG_RELATIVE_PATH = path.join(".config", "otto", "config.jsonc")

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

  const validated = ottoConfigSchema.safeParse(parsed)

  if (!validated.success) {
    const detail = validated.error.issues
      .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
      .join("; ")

    throw new Error(`Invalid Otto config in ${configPath}: ${detail}`)
  }

  return validated.data
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
