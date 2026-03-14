import path from "node:path"
import { spawn } from "node:child_process"
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises"

import semver from "semver"

import { parseJsonc, type ExtensionManifest } from "otto-extension-sdk"

import {
  fetchExtensionRegistryIndex,
  installRegistryArchiveToPath,
  listRegistryExtensions,
  resolveRegistryEntry,
} from "./registry.js"
import {
  createExtensionStateRepository,
  ensureExtensionPersistenceDirectories,
  resolveExtensionPersistencePaths,
} from "./state.js"

const INTERNAL_OPENCODE_RUNTIME_DEPENDENCIES: Record<string, string> = {
  "@opencode-ai/plugin": "1.2.20",
  "better-sqlite3": "^11.8.1",
}

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
  toolsExtensionPath: string
  toolsRootPath: string
  skillsPath: string
} => {
  return {
    toolsExtensionPath: path.join(ottoHome, ".opencode", "tools", "extensions", extensionId),
    toolsRootPath: path.join(ottoHome, ".opencode", "tools"),
    skillsPath: path.join(ottoHome, ".opencode", "skills", "extensions", extensionId),
  }
}

const syncToolsIntoRoot = async (
  sourceToolsPath: string,
  toolsRootPath: string,
  extensionId: string
): Promise<void> => {
  const toolEntries = await readdir(sourceToolsPath, { withFileTypes: true })
  await mkdir(toolsRootPath, { recursive: true })

  for (const entry of toolEntries) {
    if (!entry.isFile()) {
      continue
    }

    const isToolScript =
      entry.name.endsWith(".ts") ||
      entry.name.endsWith(".js") ||
      entry.name.endsWith(".mjs") ||
      entry.name.endsWith(".cjs")
    if (!isToolScript) {
      continue
    }

    const sourcePath = path.join(sourceToolsPath, entry.name)
    const targetPath = path.join(toolsRootPath, entry.name)
    const sourceContent = await readFile(sourcePath, "utf8")
    const existingContent = await readFile(targetPath, "utf8").catch(() => null)

    if (existingContent != null && existingContent !== sourceContent) {
      throw new Error(
        `Extension '${extensionId}' cannot install tool '${entry.name}' because a different tool file already exists at ${targetPath}`
      )
    }

    await writeFile(targetPath, sourceContent, "utf8")
  }
}

const removeToolsFromRoot = async (
  sourceToolsPath: string,
  toolsRootPath: string
): Promise<void> => {
  const toolEntries = await readdir(sourceToolsPath, { withFileTypes: true }).catch(() => [])
  for (const entry of toolEntries) {
    if (!entry.isFile()) {
      continue
    }

    const isToolScript =
      entry.name.endsWith(".ts") ||
      entry.name.endsWith(".js") ||
      entry.name.endsWith(".mjs") ||
      entry.name.endsWith(".cjs")
    if (!isToolScript) {
      continue
    }

    await rm(path.join(toolsRootPath, entry.name), { force: true })
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

type DependencySource = {
  extensionId: string
  extensionVersion: string
  packageJsonPath: string
}

type ExtensionHookName = "install" | "update"

type ExtensionHookWarning = {
  hook: ExtensionHookName
  scriptPath: string
  reason: string
}

const resolveHookPathForCurrentPlatform = (
  manifest: ExtensionManifest,
  hook: ExtensionHookName
): string | null => {
  const target = manifest.payload.hooks?.[hook]
  if (!target) {
    return null
  }

  if (process.platform === "darwin" && target.darwin) {
    return target.darwin
  }

  if (process.platform === "linux" && target.linux) {
    return target.linux
  }

  return target.all ?? null
}

const resolveHookScriptPath = (
  extensionStorePath: string,
  manifest: ExtensionManifest,
  hook: ExtensionHookName
): string | null => {
  const relativePath = resolveHookPathForCurrentPlatform(manifest, hook)
  if (!relativePath) {
    return null
  }

  if (path.isAbsolute(relativePath)) {
    throw new Error(
      `Invalid ${hook} hook path for '${manifest.id}@${manifest.version}': absolute paths are not allowed`
    )
  }

  const resolvedRoot = path.resolve(extensionStorePath)
  const resolvedScriptPath = path.resolve(extensionStorePath, relativePath)
  const isWithinStoreRoot =
    resolvedScriptPath === resolvedRoot ||
    resolvedScriptPath.startsWith(`${resolvedRoot}${path.sep}`)
  if (!isWithinStoreRoot) {
    throw new Error(
      `Invalid ${hook} hook path for '${manifest.id}@${manifest.version}': path escapes extension directory`
    )
  }

  return resolvedScriptPath
}

const executeExtensionHook = async (input: {
  ottoHome: string
  extensionStorePath: string
  manifest: ExtensionManifest
  hook: ExtensionHookName
  previousVersion: string | null
}): Promise<ExtensionHookWarning | null> => {
  let scriptPath: string | null
  try {
    scriptPath = resolveHookScriptPath(input.extensionStorePath, input.manifest, input.hook)
  } catch (error) {
    const err = error as Error
    return {
      hook: input.hook,
      scriptPath: "<invalid-hook-path>",
      reason: err.message,
    }
  }

  if (!scriptPath) {
    return null
  }

  const execution = await new Promise<
    { ok: true } | { ok: false; reason: string; stdout: string; stderr: string }
  >((resolve) => {
    const child = spawn("bash", [scriptPath], {
      cwd: input.extensionStorePath,
      env: {
        ...process.env,
        OTTO_HOME: input.ottoHome,
        OTTO_EXTENSION_ID: input.manifest.id,
        OTTO_EXTENSION_VERSION: input.manifest.version,
        OTTO_EXTENSION_PREVIOUS_VERSION: input.previousVersion ?? "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    })

    let stdout = ""
    let stderr = ""

    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk)
    })

    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk)
    })

    child.on("error", (error) => {
      resolve({
        ok: false,
        reason: `spawn failed: ${error.message}`,
        stdout,
        stderr,
      })
    })

    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve({ ok: true })
        return
      }

      const statusReason =
        typeof code === "number"
          ? `exit code ${code}`
          : signal
            ? `terminated by signal ${signal}`
            : "unknown process termination"
      resolve({
        ok: false,
        reason: statusReason,
        stdout,
        stderr,
      })
    })
  })

  if (execution.ok) {
    return null
  }

  const stderrTail = execution.stderr.trim()
  const stdoutTail = execution.stdout.trim()
  const detail = stderrTail || stdoutTail

  return {
    hook: input.hook,
    scriptPath,
    reason: detail ? `${execution.reason}: ${detail}` : execution.reason,
  }
}

const resolveRelativeToolPackageJsonPath = (manifest: ExtensionManifest): string | null => {
  const packageJsonRelativePath = manifest.payload.tools?.packageJson
  if (!packageJsonRelativePath) {
    return null
  }

  if (path.isAbsolute(packageJsonRelativePath)) {
    throw new Error(
      `Invalid tool packageJson path for '${manifest.id}@${manifest.version}': absolute paths are not allowed`
    )
  }

  const toolsRootHint = `${manifest.payload.tools?.path ?? "tools"}${path.sep}`
  return packageJsonRelativePath.startsWith(toolsRootHint)
    ? packageJsonRelativePath.slice(toolsRootHint.length)
    : packageJsonRelativePath
}

const mergeDependencies = (
  merged: Map<string, { version: string; source: DependencySource }>,
  nextDependencies: Record<string, unknown>,
  source: DependencySource
): void => {
  for (const [name, value] of Object.entries(nextDependencies)) {
    if (typeof value !== "string" || value.trim().length === 0) {
      continue
    }

    const version = value.trim()
    const existing = merged.get(name)
    if (!existing) {
      merged.set(name, { version, source })
      continue
    }

    if (existing.version !== version) {
      throw new Error(
        `Extension tool dependency conflict for '${name}': '${existing.version}' from '${existing.source.extensionId}@${existing.source.extensionVersion}' conflicts with '${version}' from '${source.extensionId}@${source.extensionVersion}'`
      )
    }
  }
}

const buildOpencodeToolsPackageJson = async (
  ottoHome: string,
  repository: ReturnType<typeof createExtensionStateRepository>,
  versionOverrides?: Map<string, string | null>
): Promise<{ dependencies: Record<string, string>; hasDependencies: boolean }> => {
  const paths = resolveExtensionPersistencePaths(ottoHome)
  const installed = await repository.listInstalledExtensions()
  const merged = new Map<string, { version: string; source: DependencySource }>()
  const processedExtensionIds = new Set<string>()

  for (const entry of installed) {
    const overrideVersion = versionOverrides?.get(entry.id)
    const version =
      overrideVersion === undefined
        ? (entry.activeVersion ?? resolveLatestVersion(entry.installedVersions))
        : overrideVersion
    processedExtensionIds.add(entry.id)
    if (!version) {
      continue
    }

    const storeVersionPath = path.join(paths.storeRoot, entry.id, version)
    const manifest = await loadManifest(path.join(storeVersionPath, "manifest.jsonc"))
    const relativePackageJsonPath = resolveRelativeToolPackageJsonPath(manifest)
    if (!relativePackageJsonPath || !manifest.payload.tools?.path) {
      continue
    }

    const toolsRoot = path.resolve(storeVersionPath, manifest.payload.tools.path)
    const packageJsonPath = path.resolve(toolsRoot, relativePackageJsonPath)
    const isUnderToolsRoot =
      packageJsonPath === toolsRoot || packageJsonPath.startsWith(`${toolsRoot}${path.sep}`)
    if (!isUnderToolsRoot) {
      throw new Error(
        `Invalid tool packageJson path for '${manifest.id}@${manifest.version}': path escapes tools directory`
      )
    }

    const packageJsonSource = await readFile(packageJsonPath, "utf8")
    const parsed = parseJsonc(packageJsonSource)
    if (typeof parsed !== "object" || parsed == null || Array.isArray(parsed)) {
      throw new Error(`Invalid tool packageJson at ${packageJsonPath}`)
    }

    const dependencies = (parsed as { dependencies?: Record<string, unknown> }).dependencies ?? {}
    mergeDependencies(merged, dependencies, {
      extensionId: manifest.id,
      extensionVersion: manifest.version,
      packageJsonPath,
    })
  }

  if (versionOverrides) {
    for (const [extensionId, version] of versionOverrides.entries()) {
      if (processedExtensionIds.has(extensionId) || !version) {
        continue
      }

      const storeVersionPath = path.join(paths.storeRoot, extensionId, version)
      const manifest = await loadManifest(path.join(storeVersionPath, "manifest.jsonc"))
      const relativePackageJsonPath = resolveRelativeToolPackageJsonPath(manifest)
      if (!relativePackageJsonPath || !manifest.payload.tools?.path) {
        continue
      }

      const toolsRoot = path.resolve(storeVersionPath, manifest.payload.tools.path)
      const packageJsonPath = path.resolve(toolsRoot, relativePackageJsonPath)
      const isUnderToolsRoot =
        packageJsonPath === toolsRoot || packageJsonPath.startsWith(`${toolsRoot}${path.sep}`)
      if (!isUnderToolsRoot) {
        throw new Error(
          `Invalid tool packageJson path for '${manifest.id}@${manifest.version}': path escapes tools directory`
        )
      }

      const packageJsonSource = await readFile(packageJsonPath, "utf8")
      const parsed = parseJsonc(packageJsonSource)
      if (typeof parsed !== "object" || parsed == null || Array.isArray(parsed)) {
        throw new Error(`Invalid tool packageJson at ${packageJsonPath}`)
      }

      const dependencies = (parsed as { dependencies?: Record<string, unknown> }).dependencies ?? {}
      mergeDependencies(merged, dependencies, {
        extensionId: manifest.id,
        extensionVersion: manifest.version,
        packageJsonPath,
      })
    }
  }

  const dependencyRecord = Object.fromEntries(
    [...merged.entries()]
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([name, detail]) => [name, detail.version])
  )

  return {
    dependencies: dependencyRecord,
    hasDependencies: Object.keys(dependencyRecord).length > 0,
  }
}

export const syncOpencodeToolsPackageJson = async (ottoHome: string): Promise<void> => {
  const repository = createExtensionStateRepository(ottoHome)
  const packageRootPath = path.join(ottoHome, ".opencode")
  const packageJsonPath = path.join(packageRootPath, "package.json")
  const result = await buildOpencodeToolsPackageJson(ottoHome, repository)

  const dependencies = {
    ...result.dependencies,
    ...INTERNAL_OPENCODE_RUNTIME_DEPENDENCIES,
  }

  await mkdir(packageRootPath, { recursive: true })
  await writeFile(
    packageJsonPath,
    `${JSON.stringify(
      {
        name: "otto-opencode-tools-runtime",
        private: true,
        type: "module",
        dependencies,
      },
      null,
      2
    )}\n`,
    "utf8"
  )
}

const assertOpencodeToolsPackageJsonResolvable = async (
  ottoHome: string,
  versionOverrides: Map<string, string | null>
): Promise<void> => {
  const repository = createExtensionStateRepository(ottoHome)
  await buildOpencodeToolsPackageJson(ottoHome, repository, versionOverrides)
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
  await rm(runtimePaths.toolsExtensionPath, { recursive: true, force: true })
  await rm(runtimePaths.skillsPath, { recursive: true, force: true })

  if (manifest.payload.tools?.path) {
    const sourceToolsPath = path.join(storeVersionPath, manifest.payload.tools.path)
    await mkdir(path.dirname(runtimePaths.toolsExtensionPath), { recursive: true })
    await cp(sourceToolsPath, runtimePaths.toolsExtensionPath, { recursive: true })
    await syncToolsIntoRoot(sourceToolsPath, runtimePaths.toolsRootPath, extensionId)
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
  await rm(runtimePaths.toolsExtensionPath, { recursive: true, force: true })
  await rm(runtimePaths.skillsPath, { recursive: true, force: true })

  if (manifest.payload.tools?.path) {
    const sourceToolsPath = path.join(storeVersionPath, manifest.payload.tools.path)
    await removeToolsFromRoot(sourceToolsPath, runtimePaths.toolsRootPath)
  }

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
  hookWarnings: ExtensionHookWarning[]
}

export type ExtensionRemoveResult = {
  id: string
  removedVersion: string
}

type ExtensionOperatorContext = {
  ottoHome: string
  registryUrl: string
}

/**
 * Lists catalog availability and locally installed extension versions so operators can quickly
 * inspect what is available and what is currently installed.
 *
 * @param context Extension operator context with Otto home and registry URL.
 * @returns Catalog and installed extension summary.
 */
export const listExtensions = async (
  context: ExtensionOperatorContext
): Promise<ExtensionOperatorListResult> => {
  await ensureExtensionPersistenceDirectories(context.ottoHome)

  const index = await fetchExtensionRegistryIndex(context.registryUrl)
  const registryCatalog = listRegistryExtensions(index)
  const latestById = new Map(registryCatalog.map((entry) => [entry.id, entry.latestVersion]))

  const repository = createExtensionStateRepository(context.ottoHome)
  const installed = await repository.listInstalledExtensions()

  const installedSummary = installed
    .map((entry) => {
      const latestCatalogVersion = latestById.get(entry.id) ?? null
      const installedVersion = resolveLatestVersion(entry.installedVersions)
      if (!installedVersion) {
        throw new Error(`Installed extension '${entry.id}' has no versions`)
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
    catalog: registryCatalog,
    installed: installedSummary,
  }
}

/**
 * Installs an extension from registry into local store and prunes older installed versions so
 * operator-managed state remains single-version per extension id.
 *
 * @param context Extension operator context with Otto home and registry URL.
 * @param target User target string in `<id>` or `<id>@<version>` form.
 * @returns Installation result and pruned version metadata.
 */
export const installExtension = async (
  context: ExtensionOperatorContext,
  target: string
): Promise<ExtensionInstallResult> => {
  await ensureExtensionPersistenceDirectories(context.ottoHome)

  const parsed = parseTargetSpecifier(target)
  const index = await fetchExtensionRegistryIndex(context.registryUrl)
  const selected = resolveRegistryEntry(index, parsed.id, parsed.version)

  const repository = createExtensionStateRepository(context.ottoHome)
  const existing = (await repository.listInstalledExtensions()).find(
    (entry) => entry.id === selected.id
  )
  const existingVersions = existing?.installedVersions ?? []
  const previousInstalledVersion = resolveLatestVersion(existingVersions)
  const targetAlreadyInstalled = existingVersions.includes(selected.version)
  const isFirstInstall = existingVersions.length === 0
  const hookWarnings: ExtensionHookWarning[] = []

  const pruneCandidates = existingVersions.filter((version) => version !== selected.version)
  const replacingExistingRuntime =
    previousInstalledVersion !== null && previousInstalledVersion !== selected.version

  const paths = resolveExtensionPersistencePaths(context.ottoHome)
  const targetPath = path.join(paths.storeRoot, selected.id, selected.version)
  await rm(targetPath, { recursive: true, force: true })
  await installRegistryArchiveToPath(selected, targetPath)

  const installedManifest = await loadManifest(path.join(targetPath, "manifest.jsonc"))
  const hookToRun: ExtensionHookName | null = isFirstInstall
    ? "install"
    : previousInstalledVersion && previousInstalledVersion !== selected.version
      ? "update"
      : null
  if (hookToRun) {
    const warning = await executeExtensionHook({
      ottoHome: context.ottoHome,
      extensionStorePath: targetPath,
      manifest: installedManifest,
      hook: hookToRun,
      previousVersion: previousInstalledVersion,
    })
    if (warning) {
      hookWarnings.push(warning)
    }
  }

  await assertOpencodeToolsPackageJsonResolvable(
    context.ottoHome,
    new Map([[selected.id, selected.version]])
  )

  if (replacingExistingRuntime && previousInstalledVersion) {
    await removeRuntimeFootprintForExtension(
      context.ottoHome,
      selected.id,
      previousInstalledVersion
    )
  }

  try {
    await syncRuntimeFootprintForExtension(context.ottoHome, selected.id, selected.version)
  } catch (error) {
    if (replacingExistingRuntime && previousInstalledVersion) {
      await syncRuntimeFootprintForExtension(
        context.ottoHome,
        selected.id,
        previousInstalledVersion
      ).catch(() => undefined)
    }

    throw error
  }

  await repository.recordInstalledVersion(selected.id, selected.version)
  await repository.setActiveVersion(selected.id, selected.version)

  for (const candidate of pruneCandidates) {
    await removeStoreVersionIfPresent(context.ottoHome, selected.id, candidate)
    await repository.removeInstalledVersion(selected.id, candidate)
  }

  await syncOpencodeToolsPackageJson(context.ottoHome)

  return {
    id: selected.id,
    installedVersion: selected.version,
    prunedVersions: pruneCandidates,
    wasAlreadyInstalled: targetAlreadyInstalled && pruneCandidates.length === 0,
    hookWarnings,
  }
}

/**
 * Updates a single installed extension by installing the latest registry version and pruning
 * stale versions from local store/state.
 *
 * @param context Extension operator context with Otto home and registry URL.
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
 * Updates all currently installed extensions to latest registry versions so operators can run
 * a single command for bulk extension refresh.
 *
 * @param context Extension operator context with Otto home and registry URL.
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
 * @param context Extension operator context with Otto home and registry URL.
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
  await syncOpencodeToolsPackageJson(context.ottoHome)

  return {
    id: parsed.id,
    removedVersion: installedVersion,
  }
}

/**
 * Disables an installed extension by removing its runtime footprint and uninstalling the
 * retained version so extension behavior is immediately removed from runtime.
 *
 * @param context Extension operator context with Otto home and registry URL.
 * @param extensionId Extension id to disable.
 * @returns Removal metadata.
 */
export const disableExtension = async (
  context: ExtensionOperatorContext,
  extensionId: string
): Promise<ExtensionRemoveResult> => {
  return removeExtension(context, extensionId)
}
