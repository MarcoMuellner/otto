import path from "node:path"
import { cp, mkdir, readFile, readdir, rm } from "node:fs/promises"

import semver from "semver"

import {
  formatValidationReport,
  type ExtensionCatalogEntry,
  parseJsonc,
  type ExtensionManifest,
  validateExtensionCatalog,
} from "otto-extension-sdk"

import {
  createExtensionStateRepository,
  ensureExtensionPersistenceDirectories,
  resolveExtensionPersistencePaths,
} from "./state.js"

const resolveLatestVersion = (versions: string[]): string | null => {
  if (versions.length === 0) {
    return null
  }

  const sorted = [...versions].sort((left, right) => semver.rcompare(left, right))
  return sorted[0] ?? null
}

const parseTargetSpecifier = (value: string): { id: string; version: string | null } => {
  const normalized = value.trim()
  if (!normalized) {
    throw new Error("Extension target must be a non-empty string")
  }

  const atIndex = normalized.indexOf("@")
  if (atIndex < 0) {
    return { id: normalized, version: null }
  }

  const id = normalized.slice(0, atIndex).trim()
  const version = normalized.slice(atIndex + 1).trim()

  if (!id || !version) {
    throw new Error(`Invalid extension target '${value}'. Use <id> or <id>@<version>`)
  }

  if (!semver.valid(version)) {
    throw new Error(`Invalid extension version '${version}' in target '${value}'`)
  }

  return { id, version }
}

const resolveCatalogEntries = async (
  catalogRoot: string
): Promise<{ entries: ExtensionCatalogEntry[]; byId: Map<string, ExtensionCatalogEntry[]> }> => {
  const validation = await validateExtensionCatalog(catalogRoot)
  if (!validation.ok) {
    throw new Error(formatValidationReport(validation, catalogRoot))
  }

  const byId = new Map<string, ExtensionCatalogEntry[]>()
  for (const entry of validation.entries) {
    const group = byId.get(entry.id) ?? []
    group.push(entry)
    byId.set(entry.id, group)
  }

  for (const group of byId.values()) {
    group.sort((left, right) => semver.rcompare(left.version, right.version))
  }

  return { entries: validation.entries, byId }
}

const removeStoreVersionIfPresent = async (
  ottoHome: string,
  extensionId: string,
  version: string
): Promise<void> => {
  const paths = resolveExtensionPersistencePaths(ottoHome)
  const versionPath = path.join(paths.storeRoot, extensionId, version)
  await rm(versionPath, { recursive: true, force: true })

  const extensionRootPath = path.join(paths.storeRoot, extensionId)
  const remaining = await readdir(extensionRootPath).catch(() => [])
  if (remaining.length === 0) {
    await rm(extensionRootPath, { recursive: true, force: true })
  }
}

const resolveRuntimeExtensionPaths = (
  ottoHome: string,
  extensionId: string
): {
  toolsPath: string
  skillsPath: string
} => {
  return {
    toolsPath: path.join(ottoHome, ".opencode", "tools", "extensions", extensionId),
    skillsPath: path.join(ottoHome, ".opencode", "skills", "extensions", extensionId),
  }
}

const loadManifest = async (manifestPath: string): Promise<ExtensionManifest> => {
  const source = await readFile(manifestPath, "utf8")
  const parsed = parseJsonc(source)

  if (typeof parsed !== "object" || parsed == null) {
    throw new Error(`Invalid extension manifest at ${manifestPath}`)
  }

  return parsed as ExtensionManifest
}

const loadMcpFragment = async (
  extensionStorePath: string,
  manifest: ExtensionManifest
): Promise<Record<string, unknown>> => {
  if (!manifest.payload.mcp?.file) {
    return {}
  }

  const mcpPath = path.join(extensionStorePath, manifest.payload.mcp.file)
  const source = await readFile(mcpPath, "utf8")
  const parsed = parseJsonc(source)
  if (typeof parsed !== "object" || parsed == null || Array.isArray(parsed)) {
    throw new Error(`MCP fragment at ${mcpPath} must be an object`)
  }

  return parsed as Record<string, unknown>
}

const syncRuntimeFootprintForExtension = async (
  ottoHome: string,
  extensionId: string,
  version: string
): Promise<void> => {
  const paths = resolveExtensionPersistencePaths(ottoHome)
  const storeVersionPath = path.join(paths.storeRoot, extensionId, version)
  const manifestPath = path.join(storeVersionPath, "manifest.jsonc")
  const manifest = await loadManifest(manifestPath)

  const runtimePaths = resolveRuntimeExtensionPaths(ottoHome, extensionId)
  await rm(runtimePaths.toolsPath, { recursive: true, force: true })
  await rm(runtimePaths.skillsPath, { recursive: true, force: true })

  if (manifest.payload.tools?.path) {
    const sourceToolsPath = path.join(storeVersionPath, manifest.payload.tools.path)
    await mkdir(path.dirname(runtimePaths.toolsPath), { recursive: true })
    await cp(sourceToolsPath, runtimePaths.toolsPath, { recursive: true })
  }

  if (manifest.payload.skills?.path) {
    const sourceSkillsPath = path.join(storeVersionPath, manifest.payload.skills.path)
    const skillsRuntimeRoot = path.join(ottoHome, ".opencode", "skills")
    const skillEntries = await readdir(sourceSkillsPath, { withFileTypes: true })

    await mkdir(skillsRuntimeRoot, { recursive: true })

    for (const entry of skillEntries) {
      if (!entry.isDirectory()) {
        continue
      }

      const sourceEntryPath = path.join(sourceSkillsPath, entry.name)
      const targetEntryPath = path.join(skillsRuntimeRoot, entry.name)

      await rm(targetEntryPath, { recursive: true, force: true })
      await cp(sourceEntryPath, targetEntryPath, { recursive: true })
    }

    const nonDirectoryEntries = skillEntries.filter((entry) => !entry.isDirectory())
    if (nonDirectoryEntries.length > 0) {
      await mkdir(runtimePaths.skillsPath, { recursive: true })
      for (const entry of nonDirectoryEntries) {
        await cp(
          path.join(sourceSkillsPath, entry.name),
          path.join(runtimePaths.skillsPath, entry.name),
          {
            recursive: true,
          }
        )
      }
    }
  }

  await loadMcpFragment(storeVersionPath, manifest)
}

const removeRuntimeFootprintForExtension = async (
  ottoHome: string,
  extensionId: string,
  version: string
): Promise<void> => {
  const paths = resolveExtensionPersistencePaths(ottoHome)
  const storeVersionPath = path.join(paths.storeRoot, extensionId, version)
  const manifest = await loadManifest(path.join(storeVersionPath, "manifest.jsonc"))

  const runtimePaths = resolveRuntimeExtensionPaths(ottoHome, extensionId)
  await rm(runtimePaths.toolsPath, { recursive: true, force: true })
  await rm(runtimePaths.skillsPath, { recursive: true, force: true })

  if (manifest.payload.skills?.path) {
    const sourceSkillsPath = path.join(storeVersionPath, manifest.payload.skills.path)
    const skillEntries = await readdir(sourceSkillsPath, { withFileTypes: true }).catch(() => [])
    for (const entry of skillEntries) {
      if (!entry.isDirectory()) {
        continue
      }

      await rm(path.join(ottoHome, ".opencode", "skills", entry.name), {
        recursive: true,
        force: true,
      })
    }
  }

  await loadMcpFragment(storeVersionPath, manifest)
}

const resolveCatalogEntryForInstall = (
  byId: Map<string, ExtensionCatalogEntry[]>,
  extensionId: string,
  version: string | null
): ExtensionCatalogEntry => {
  const candidates = byId.get(extensionId)
  if (!candidates || candidates.length === 0) {
    throw new Error(`Extension '${extensionId}' is not present in catalog`)
  }

  if (!version) {
    const latest = candidates[0]
    if (!latest) {
      throw new Error(`Could not resolve latest version for extension '${extensionId}'`)
    }
    return latest
  }

  const exact = candidates.find((candidate) => candidate.version === version)
  if (!exact) {
    throw new Error(`Extension '${extensionId}@${version}' is not present in catalog`)
  }

  return exact
}

export type ExtensionOperatorListResult = {
  catalog: Array<{
    id: string
    versions: string[]
    latestVersion: string
  }>
  installed: Array<{
    id: string
    version: string
    latestCatalogVersion: string | null
    upToDate: boolean
  }>
}

export type ExtensionInstallResult = {
  id: string
  installedVersion: string
  prunedVersions: string[]
  wasAlreadyInstalled: boolean
}

export type ExtensionRemoveResult = {
  id: string
  removedVersion: string
}

type ExtensionOperatorContext = {
  ottoHome: string
  catalogRoot: string
}

/**
 * Lists catalog availability and locally installed extension versions so operators can quickly
 * inspect what is available and what is currently installed.
 *
 * @param context Extension operator context with Otto home and catalog root.
 * @returns Catalog and installed extension summary.
 */
export const listExtensions = async (
  context: ExtensionOperatorContext
): Promise<ExtensionOperatorListResult> => {
  await ensureExtensionPersistenceDirectories(context.ottoHome)

  const { byId } = await resolveCatalogEntries(context.catalogRoot)
  const repository = createExtensionStateRepository(context.ottoHome)
  const installed = await repository.listInstalledExtensions()

  const catalog = [...byId.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, entries]) => {
      const versions = entries.map((entry) => entry.version)
      const latestVersion = versions[0]
      if (!latestVersion) {
        throw new Error(`Catalog for '${id}' has no versions`)
      }

      return {
        id,
        versions,
        latestVersion,
      }
    })

  const installedSummary = installed
    .map((entry) => {
      const latestCatalogVersion = byId.get(entry.id)?.[0]?.version ?? null
      const installedVersion = resolveLatestVersion(entry.installedVersions)
      if (!installedVersion) {
        throw new Error(`Installed extension '${entry.id}' has no versions`) // invariant
      }

      return {
        id: entry.id,
        version: installedVersion,
        latestCatalogVersion,
        upToDate: Boolean(latestCatalogVersion && latestCatalogVersion === installedVersion),
      }
    })
    .sort((left, right) => left.id.localeCompare(right.id))

  return {
    catalog,
    installed: installedSummary,
  }
}

/**
 * Installs an extension from catalog into local store and prunes older installed versions so
 * operator-managed state remains single-version per extension id.
 *
 * @param context Extension operator context with Otto home and catalog root.
 * @param target User target string in `<id>` or `<id>@<version>` form.
 * @returns Installation result and pruned version metadata.
 */
export const installExtension = async (
  context: ExtensionOperatorContext,
  target: string
): Promise<ExtensionInstallResult> => {
  await ensureExtensionPersistenceDirectories(context.ottoHome)

  const parsed = parseTargetSpecifier(target)
  const { byId } = await resolveCatalogEntries(context.catalogRoot)
  const selected = resolveCatalogEntryForInstall(byId, parsed.id, parsed.version)

  const repository = createExtensionStateRepository(context.ottoHome)
  const existing = (await repository.listInstalledExtensions()).find(
    (entry) => entry.id === selected.id
  )
  const existingVersions = existing?.installedVersions ?? []
  const previousInstalledVersion = resolveLatestVersion(existingVersions)
  const targetAlreadyInstalled = existingVersions.includes(selected.version)

  const pruneCandidates = existingVersions.filter((version) => version !== selected.version)

  if (previousInstalledVersion && previousInstalledVersion !== selected.version) {
    await removeRuntimeFootprintForExtension(
      context.ottoHome,
      selected.id,
      previousInstalledVersion
    )
  }

  const paths = resolveExtensionPersistencePaths(context.ottoHome)
  const targetPath = path.join(paths.storeRoot, selected.id, selected.version)
  await rm(targetPath, { recursive: true, force: true })
  await cp(selected.directory, targetPath, { recursive: true })

  await repository.recordInstalledVersion(selected.id, selected.version)
  await repository.setActiveVersion(selected.id, selected.version)
  await syncRuntimeFootprintForExtension(context.ottoHome, selected.id, selected.version)

  for (const candidate of pruneCandidates) {
    await removeStoreVersionIfPresent(context.ottoHome, selected.id, candidate)
    await repository.removeInstalledVersion(selected.id, candidate)
  }

  return {
    id: selected.id,
    installedVersion: selected.version,
    prunedVersions: pruneCandidates,
    wasAlreadyInstalled: targetAlreadyInstalled && pruneCandidates.length === 0,
  }
}

/**
 * Updates a single installed extension by installing the latest catalog version and pruning
 * stale versions from local store/state.
 *
 * @param context Extension operator context with Otto home and catalog root.
 * @param extensionId Extension id to update.
 * @returns Installation result for the updated extension.
 */
export const updateExtension = async (
  context: ExtensionOperatorContext,
  extensionId: string
): Promise<ExtensionInstallResult> => {
  return installExtension(context, extensionId)
}

/**
 * Updates all currently installed extensions to latest catalog versions so operators can run
 * a single command for bulk catalog refresh.
 *
 * @param context Extension operator context with Otto home and catalog root.
 * @returns Per-extension update results.
 */
export const updateAllExtensions = async (
  context: ExtensionOperatorContext
): Promise<ExtensionInstallResult[]> => {
  await ensureExtensionPersistenceDirectories(context.ottoHome)
  const repository = createExtensionStateRepository(context.ottoHome)
  const installed = await repository.listInstalledExtensions()
  const ids = [...new Set(installed.map((entry) => entry.id))].sort((left, right) =>
    left.localeCompare(right)
  )

  const results: ExtensionInstallResult[] = []
  for (const id of ids) {
    results.push(await updateExtension(context, id))
  }

  return results
}

/**
 * Removes the currently installed extension version from store/state with active guardrails so
 * destructive operations remain safe and deterministic.
 *
 * @param context Extension operator context with Otto home and catalog root.
 * @param target User target string in `<id>` or `<id>@<version>` form.
 * @returns Removal metadata.
 */
export const removeExtension = async (
  context: ExtensionOperatorContext,
  target: string
): Promise<ExtensionRemoveResult> => {
  await ensureExtensionPersistenceDirectories(context.ottoHome)

  const parsed = parseTargetSpecifier(target)
  const repository = createExtensionStateRepository(context.ottoHome)
  const existing = (await repository.listInstalledExtensions()).find(
    (entry) => entry.id === parsed.id
  )

  if (!existing) {
    throw new Error(`Extension '${parsed.id}' is not installed`)
  }

  const installedVersion = resolveLatestVersion(existing.installedVersions)
  if (!installedVersion) {
    throw new Error(`Extension '${parsed.id}' has no installed version`)
  }

  if (parsed.version && parsed.version !== installedVersion) {
    throw new Error(
      `Extension '${parsed.id}' is installed as '${installedVersion}', not '${parsed.version}'`
    )
  }

  await repository.setActiveVersion(parsed.id, null)

  await removeRuntimeFootprintForExtension(context.ottoHome, parsed.id, installedVersion)
  await removeStoreVersionIfPresent(context.ottoHome, parsed.id, installedVersion)
  await repository.removeInstalledVersion(parsed.id, installedVersion)

  return {
    id: parsed.id,
    removedVersion: installedVersion,
  }
}

/**
 * Disables an installed extension by removing its runtime footprint and uninstalling the
 * retained version so extension behavior is immediately removed from runtime.
 *
 * @param context Extension operator context with Otto home and catalog root.
 * @param extensionId Extension id to disable.
 * @returns Removal metadata.
 */
export const disableExtension = async (
  context: ExtensionOperatorContext,
  extensionId: string
): Promise<ExtensionRemoveResult> => {
  return removeExtension(context, extensionId)
}
