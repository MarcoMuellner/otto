import path from "node:path"
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"

import { z } from "zod"

const extensionStateEntrySchema = z
  .object({
    installedVersions: z.array(z.string().min(1)).default([]),
    activeVersion: z.string().min(1).nullable().default(null),
    installedAtByVersion: z.record(z.string(), z.number().int().nonnegative()).default({}),
    updatedAt: z.number().int().nonnegative(),
  })
  .superRefine((entry, context) => {
    if (!entry.activeVersion) {
      return
    }

    if (entry.installedVersions.includes(entry.activeVersion)) {
      return
    }

    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "activeVersion must reference an installed version",
      path: ["activeVersion"],
    })
  })

const extensionStateSchema = z.object({
  version: z.literal(1),
  extensions: z.record(z.string(), extensionStateEntrySchema),
})

type ExtensionStateEntry = z.infer<typeof extensionStateEntrySchema>
type ExtensionState = z.infer<typeof extensionStateSchema>

export type ExtensionStateRecord = {
  id: string
  installedVersions: string[]
  activeVersion: string | null
  installedAtByVersion: Record<string, number>
  updatedAt: number
}

export type RemoveExtensionVersionGuard =
  | {
      allowed: true
      reason: null
    }
  | {
      allowed: false
      reason: "active_version"
    }

export class ExtensionStateError extends Error {
  readonly code:
    | "extension.not_installed"
    | "extension.version_not_installed"
    | "extension.version_active"

  constructor(
    code:
      | "extension.not_installed"
      | "extension.version_not_installed"
      | "extension.version_active",
    message: string
  ) {
    super(message)
    this.code = code
  }
}

export type ExtensionStateRepository = {
  listInstalledExtensions: () => Promise<ExtensionStateRecord[]>
  listEnabledExtensions: () => Promise<ExtensionStateRecord[]>
  recordInstalledVersion: (
    extensionId: string,
    version: string,
    timestamp?: number
  ) => Promise<ExtensionStateRecord>
  setActiveVersion: (
    extensionId: string,
    version: string | null,
    timestamp?: number
  ) => Promise<ExtensionStateRecord>
  canRemoveVersion: (extensionId: string, version: string) => Promise<RemoveExtensionVersionGuard>
  removeInstalledVersion: (
    extensionId: string,
    version: string,
    timestamp?: number
  ) => Promise<ExtensionStateRecord | null>
}

const createInitialState = (): ExtensionState => {
  return {
    version: 1,
    extensions: {},
  }
}

const normalizeVersions = (versions: string[]): string[] => {
  return [...new Set(versions)].sort((left, right) => left.localeCompare(right))
}

const toRecord = (id: string, entry: ExtensionStateEntry): ExtensionStateRecord => {
  return {
    id,
    installedVersions: [...entry.installedVersions],
    activeVersion: entry.activeVersion,
    installedAtByVersion: { ...entry.installedAtByVersion },
    updatedAt: entry.updatedAt,
  }
}

const resolveStateFilePath = (ottoHome: string): string => {
  return path.join(ottoHome, "extensions", "state.json")
}

const resolveExtensionStoreRootPath = (ottoHome: string): string => {
  return path.join(ottoHome, "extensions", "store")
}

/**
 * Keeps extension persistence paths centralized so setup and runtime state operations use a
 * single deterministic filesystem contract under Otto home.
 *
 * @param ottoHome Otto workspace root path.
 * @returns Extension state and store root paths.
 */
export const resolveExtensionPersistencePaths = (
  ottoHome: string
): {
  extensionsRoot: string
  storeRoot: string
  stateFilePath: string
} => {
  const extensionsRoot = path.join(ottoHome, "extensions")

  return {
    extensionsRoot,
    storeRoot: resolveExtensionStoreRootPath(ottoHome),
    stateFilePath: resolveStateFilePath(ottoHome),
  }
}

const readStateFile = async (stateFilePath: string): Promise<ExtensionState> => {
  try {
    const source = await readFile(stateFilePath, "utf8")
    const parsed = JSON.parse(source) as unknown
    return extensionStateSchema.parse(parsed)
  } catch (error) {
    const err = error as NodeJS.ErrnoException
    if (err.code === "ENOENT") {
      return createInitialState()
    }

    if (error instanceof z.ZodError) {
      const detail = error.issues
        .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
        .join("; ")
      throw new Error(`Invalid extension state in ${stateFilePath}: ${detail}`)
    }

    throw error
  }
}

const writeStateFile = async (stateFilePath: string, state: ExtensionState): Promise<void> => {
  const validated = extensionStateSchema.parse(state)
  const directory = path.dirname(stateFilePath)
  const temporaryPath = path.join(
    directory,
    `.state.json.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  )

  await mkdir(directory, { recursive: true })

  try {
    await writeFile(temporaryPath, `${JSON.stringify(validated, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    })
    await rename(temporaryPath, stateFilePath)
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => {})
    throw error
  }
}

const assertNonEmpty = (value: string, field: "extensionId" | "version"): void => {
  if (value.trim().length > 0) {
    return
  }

  throw new Error(`${field} must be a non-empty string`)
}

/**
 * Provides durable extension install/activation state management so install and enable flows
 * can evolve independently while preserving deterministic local state across restarts.
 *
 * @param ottoHome Otto workspace root path.
 * @returns Repository exposing extension state transitions and guard checks.
 */
export const createExtensionStateRepository = (ottoHome: string): ExtensionStateRepository => {
  const stateFilePath = resolveStateFilePath(ottoHome)

  const listSortedEntries = async (): Promise<Array<[id: string, entry: ExtensionStateEntry]>> => {
    const state = await readStateFile(stateFilePath)
    return Object.entries(state.extensions).sort(([left], [right]) => left.localeCompare(right))
  }

  return {
    listInstalledExtensions: async (): Promise<ExtensionStateRecord[]> => {
      const entries = await listSortedEntries()
      return entries
        .filter(([, entry]) => entry.installedVersions.length > 0)
        .map(([id, entry]) => toRecord(id, entry))
    },
    listEnabledExtensions: async (): Promise<ExtensionStateRecord[]> => {
      const entries = await listSortedEntries()
      return entries
        .filter(([, entry]) => entry.activeVersion !== null)
        .map(([id, entry]) => toRecord(id, entry))
    },
    recordInstalledVersion: async (
      extensionId: string,
      version: string,
      timestamp = Date.now()
    ): Promise<ExtensionStateRecord> => {
      assertNonEmpty(extensionId, "extensionId")
      assertNonEmpty(version, "version")

      const state = await readStateFile(stateFilePath)
      const existing =
        state.extensions[extensionId] ??
        ({
          installedVersions: [],
          activeVersion: null,
          installedAtByVersion: {},
          updatedAt: timestamp,
        } satisfies ExtensionStateEntry)

      existing.installedVersions = normalizeVersions([...existing.installedVersions, version])
      existing.installedAtByVersion[version] ??= timestamp
      existing.updatedAt = timestamp

      state.extensions[extensionId] = existing
      await writeStateFile(stateFilePath, state)

      return toRecord(extensionId, existing)
    },
    setActiveVersion: async (
      extensionId: string,
      version: string | null,
      timestamp = Date.now()
    ): Promise<ExtensionStateRecord> => {
      assertNonEmpty(extensionId, "extensionId")

      if (version !== null) {
        assertNonEmpty(version, "version")
      }

      const state = await readStateFile(stateFilePath)
      const existing = state.extensions[extensionId]

      if (!existing || existing.installedVersions.length === 0) {
        throw new ExtensionStateError(
          "extension.not_installed",
          `Extension '${extensionId}' is not installed`
        )
      }

      if (version !== null && !existing.installedVersions.includes(version)) {
        throw new ExtensionStateError(
          "extension.version_not_installed",
          `Extension '${extensionId}@${version}' is not installed`
        )
      }

      existing.activeVersion = version
      existing.updatedAt = timestamp

      state.extensions[extensionId] = existing
      await writeStateFile(stateFilePath, state)

      return toRecord(extensionId, existing)
    },
    canRemoveVersion: async (
      extensionId: string,
      version: string
    ): Promise<RemoveExtensionVersionGuard> => {
      assertNonEmpty(extensionId, "extensionId")
      assertNonEmpty(version, "version")

      const state = await readStateFile(stateFilePath)
      const existing = state.extensions[extensionId]

      if (!existing) {
        return {
          allowed: true,
          reason: null,
        }
      }

      if (existing.activeVersion === version) {
        return {
          allowed: false,
          reason: "active_version",
        }
      }

      return {
        allowed: true,
        reason: null,
      }
    },
    removeInstalledVersion: async (
      extensionId: string,
      version: string,
      timestamp = Date.now()
    ): Promise<ExtensionStateRecord | null> => {
      assertNonEmpty(extensionId, "extensionId")
      assertNonEmpty(version, "version")

      const state = await readStateFile(stateFilePath)
      const existing = state.extensions[extensionId]

      if (!existing || existing.installedVersions.length === 0) {
        throw new ExtensionStateError(
          "extension.not_installed",
          `Extension '${extensionId}' is not installed`
        )
      }

      if (!existing.installedVersions.includes(version)) {
        throw new ExtensionStateError(
          "extension.version_not_installed",
          `Extension '${extensionId}@${version}' is not installed`
        )
      }

      if (existing.activeVersion === version) {
        throw new ExtensionStateError(
          "extension.version_active",
          `Cannot remove active extension '${extensionId}@${version}'`
        )
      }

      existing.installedVersions = existing.installedVersions.filter(
        (installedVersion) => installedVersion !== version
      )
      delete existing.installedAtByVersion[version]
      existing.updatedAt = timestamp

      if (existing.installedVersions.length === 0) {
        delete state.extensions[extensionId]
        await writeStateFile(stateFilePath, state)
        return null
      }

      state.extensions[extensionId] = existing
      await writeStateFile(stateFilePath, state)

      return toRecord(extensionId, existing)
    },
  }
}

/**
 * Ensures extension persistence directories exist during setup so follow-up extension install
 * operations can safely assume the local store layout is present.
 *
 * @param ottoHome Otto workspace root path.
 * @returns Created or verified extension directory paths.
 */
export const ensureExtensionPersistenceDirectories = async (
  ottoHome: string
): Promise<string[]> => {
  const paths = resolveExtensionPersistencePaths(ottoHome)
  const directories = [paths.extensionsRoot, paths.storeRoot]

  await Promise.all(directories.map((directory) => mkdir(directory, { recursive: true })))

  return directories
}
