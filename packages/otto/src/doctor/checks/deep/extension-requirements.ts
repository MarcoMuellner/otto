import { constants } from "node:fs"
import { access, readFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { parseJsonc } from "otto-extension-sdk"
import { z } from "zod"

import { createExtensionStateRepository } from "../../../extensions/state.js"
import type { DoctorCheckDefinition, DoctorCheckOutput } from "../../contracts.js"

type EnabledExtensionRecord = {
  id: string
  activeVersion: string | null
}

const extensionRequirementsSchema = z.object({
  env: z.array(z.string().trim().min(1)).default([]),
  files: z.array(z.string().trim().min(1)).default([]),
  binaries: z.array(z.string().trim().min(1)).default([]),
})

const extensionRequirementsManifestSchema = z.object({
  id: z.string().trim().min(1),
  version: z.string().trim().min(1),
  requirements: extensionRequirementsSchema.optional(),
})

type ExtensionRequirementsManifest = z.infer<typeof extensionRequirementsManifestSchema>

type DeepExtensionRequirementsDependencies = {
  environment?: NodeJS.ProcessEnv
  ottoHome?: string
  listEnabledExtensions?: () => Promise<EnabledExtensionRecord[]>
  loadManifest?: (input: {
    extensionId: string
    version: string
  }) => Promise<ExtensionRequirementsManifest>
  pathExists?: (filePath: string) => Promise<boolean>
  hasBinary?: (binary: string, environment: NodeJS.ProcessEnv) => Promise<boolean>
}

const resolveOttoHome = (environment: NodeJS.ProcessEnv, explicitOttoHome?: string): string => {
  if (explicitOttoHome && explicitOttoHome.trim().length > 0) {
    return explicitOttoHome
  }

  return environment.OTTO_HOME ?? path.join(os.homedir(), ".otto")
}

const resolveManifestPath = (ottoHome: string, extensionId: string, version: string): string => {
  return path.join(ottoHome, "extensions", "store", extensionId, version, "manifest.jsonc")
}

const defaultLoadManifest =
  (ottoHome: string) =>
  async (input: {
    extensionId: string
    version: string
  }): Promise<ExtensionRequirementsManifest> => {
    const manifestPath = resolveManifestPath(ottoHome, input.extensionId, input.version)
    const source = await readFile(manifestPath, "utf8")
    const parsed = parseJsonc(source)

    const validated = extensionRequirementsManifestSchema.safeParse(parsed)
    if (!validated.success) {
      throw new Error(`Invalid extension manifest at ${manifestPath}`)
    }

    return validated.data
  }

const defaultPathExists = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath, constants.F_OK)
    return true
  } catch {
    return false
  }
}

const hasExecutablePath = async (candidatePath: string): Promise<boolean> => {
  try {
    await access(candidatePath, constants.X_OK)
    return true
  } catch {
    return false
  }
}

const defaultHasBinary = async (
  binary: string,
  environment: NodeJS.ProcessEnv
): Promise<boolean> => {
  const normalized = binary.trim()
  if (normalized.length === 0) {
    return false
  }

  const isPath = normalized.includes(path.sep)
  if (isPath) {
    return await hasExecutablePath(normalized)
  }

  const pathEntries = (environment.PATH ?? "").split(path.delimiter).filter(Boolean)
  for (const entry of pathEntries) {
    const candidate = path.join(entry, normalized)
    if (await hasExecutablePath(candidate)) {
      return true
    }
  }

  return false
}

const resolveRequiredFilePath = (ottoHome: string, declaredPath: string): string => {
  if (path.isAbsolute(declaredPath)) {
    return declaredPath
  }

  return path.join(ottoHome, declaredPath)
}

/**
 * Validates enabled extension runtime requirements in deep mode so operators get explicit
 * readiness failures before integration probes run.
 */
export const createDeepExtensionRequirementsCheck = (
  dependencies: DeepExtensionRequirementsDependencies = {}
): DoctorCheckDefinition => {
  const environment = dependencies.environment ?? process.env
  const ottoHome = resolveOttoHome(environment, dependencies.ottoHome)
  const listEnabledExtensions =
    dependencies.listEnabledExtensions ??
    (async () => createExtensionStateRepository(ottoHome).listEnabledExtensions())
  const loadManifest = dependencies.loadManifest ?? defaultLoadManifest(ottoHome)
  const pathExists = dependencies.pathExists ?? defaultPathExists
  const hasBinary = dependencies.hasBinary ?? defaultHasBinary

  return {
    id: "deep.extension.requirements",
    phase: "deep.extensions",
    tier: "deep",
    timeoutMs: 20_000,
    run: async (): Promise<DoctorCheckOutput> => {
      const enabledExtensions = await listEnabledExtensions()

      if (enabledExtensions.length === 0) {
        return {
          severity: "ok",
          summary: "No enabled extensions require deep requirement validation",
          evidence: [
            {
              code: "DEEP_EXTENSION_REQUIREMENTS_SKIPPED",
              message: "No enabled extensions were found",
            },
          ],
        }
      }

      const evidence: DoctorCheckOutput["evidence"] = []
      let missingCount = 0

      for (const extension of enabledExtensions) {
        if (!extension.activeVersion || extension.activeVersion.trim().length === 0) {
          missingCount += 1
          evidence.push({
            code: "EXTENSION_ACTIVE_VERSION_MISSING",
            message: `Enabled extension '${extension.id}' has no active version`,
            details: {
              extensionId: extension.id,
            },
          })
          continue
        }

        let manifest: ExtensionRequirementsManifest
        try {
          manifest = await loadManifest({
            extensionId: extension.id,
            version: extension.activeVersion,
          })
        } catch (error) {
          const err = error as Error
          missingCount += 1
          evidence.push({
            code: "EXTENSION_MANIFEST_UNREADABLE",
            message: `Unable to load manifest for '${extension.id}@${extension.activeVersion}'`,
            details: {
              extensionId: extension.id,
              extensionVersion: extension.activeVersion,
              error: err.message,
            },
          })
          continue
        }

        const requirements = manifest.requirements
        const requiredEnv = requirements?.env ?? []
        const requiredFiles = requirements?.files ?? []
        const requiredBinaries = requirements?.binaries ?? []

        for (const envKey of requiredEnv) {
          const value = environment[envKey]
          if (typeof value === "string" && value.trim().length > 0) {
            continue
          }

          missingCount += 1
          evidence.push({
            code: "EXTENSION_REQUIREMENT_ENV_MISSING",
            message: `Missing required environment variable '${envKey}' for '${manifest.id}@${manifest.version}'`,
            details: {
              extensionId: manifest.id,
              extensionVersion: manifest.version,
              env: envKey,
            },
          })
        }

        for (const declaredPath of requiredFiles) {
          const resolvedPath = resolveRequiredFilePath(ottoHome, declaredPath)
          if (await pathExists(resolvedPath)) {
            continue
          }

          missingCount += 1
          evidence.push({
            code: "EXTENSION_REQUIREMENT_FILE_MISSING",
            message: `Missing required file '${declaredPath}' for '${manifest.id}@${manifest.version}'`,
            details: {
              extensionId: manifest.id,
              extensionVersion: manifest.version,
              declaredPath,
              resolvedPath,
            },
          })
        }

        for (const binary of requiredBinaries) {
          if (await hasBinary(binary, environment)) {
            continue
          }

          missingCount += 1
          evidence.push({
            code: "EXTENSION_REQUIREMENT_BINARY_MISSING",
            message: `Missing required binary '${binary}' for '${manifest.id}@${manifest.version}'`,
            details: {
              extensionId: manifest.id,
              extensionVersion: manifest.version,
              binary,
            },
          })
        }
      }

      if (missingCount > 0) {
        return {
          severity: "error",
          summary: `Extension requirements missing (${missingCount} issue${missingCount === 1 ? "" : "s"})`,
          evidence,
        }
      }

      return {
        severity: "ok",
        summary: "Enabled extension requirements are satisfied",
        evidence: [
          {
            code: "DEEP_EXTENSION_REQUIREMENTS_OK",
            message: "All enabled extension requirements are present",
            details: {
              enabledExtensions: enabledExtensions.length,
            },
          },
        ],
      }
    },
  }
}
