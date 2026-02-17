import path from "node:path"
import { readFile, writeFile } from "node:fs/promises"

import { parseJsonc, type ExtensionManifest } from "otto-extension-sdk"

import { createExtensionStateRepository, resolveExtensionPersistencePaths } from "./state.js"

const loadManifestFromStore = async (
  ottoHome: string,
  extensionId: string,
  version: string
): Promise<{ manifest: ExtensionManifest; extensionRoot: string }> => {
  const paths = resolveExtensionPersistencePaths(ottoHome)
  const extensionRoot = path.join(paths.storeRoot, extensionId, version)
  const manifestPath = path.join(extensionRoot, "manifest.jsonc")
  const source = await readFile(manifestPath, "utf8")
  const parsed = parseJsonc(source)

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`Invalid extension manifest at ${manifestPath}`)
  }

  return {
    manifest: parsed as ExtensionManifest,
    extensionRoot,
  }
}

const loadExtensionMcpFragment = async (
  extensionRoot: string,
  manifest: ExtensionManifest
): Promise<Record<string, unknown>> => {
  const inline = manifest.payload.mcp?.inline
  if (inline && Object.keys(inline).length > 0) {
    return inline
  }

  const mcpFile = manifest.payload.mcp?.file
  if (!mcpFile) {
    return {}
  }

  const mcpPath = path.join(extensionRoot, mcpFile)
  const source = await readFile(mcpPath, "utf8")
  const parsed = parseJsonc(source)

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`MCP fragment at ${mcpPath} must be an object`)
  }

  return parsed as Record<string, unknown>
}

/**
 * Materializes the exact OpenCode config used by runtime by merging bundled/base config with
 * installed extension MCP fragments on each serve boot.
 *
 * @param ottoHome Otto workspace root path.
 * @returns Path and serialized JSON source of the effective OpenCode config.
 */
export const materializeEffectiveOpencodeConfig = async (
  ottoHome: string
): Promise<{ configPath: string; source: string; mergedMcpKeys: string[] }> => {
  const configPath = path.join(ottoHome, "opencode.jsonc")
  const source = await readFile(configPath, "utf8")
  const parsed = parseJsonc(source)

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`OpenCode config at ${configPath} must be an object`)
  }

  const config = { ...(parsed as Record<string, unknown>) }
  const mcpFromBase =
    typeof config.mcp === "object" && config.mcp !== null && !Array.isArray(config.mcp)
      ? ({ ...(config.mcp as Record<string, unknown>) } satisfies Record<string, unknown>)
      : {}

  const repository = createExtensionStateRepository(ottoHome)
  const installed = await repository.listInstalledExtensions()
  const mergedMcp = { ...mcpFromBase }

  for (const entry of installed) {
    const version = entry.activeVersion ?? entry.installedVersions[0]
    if (!version) {
      continue
    }

    const { manifest, extensionRoot } = await loadManifestFromStore(ottoHome, entry.id, version)
    const extensionMcp = await loadExtensionMcpFragment(extensionRoot, manifest)
    Object.assign(mergedMcp, extensionMcp)
  }

  if (Object.keys(mergedMcp).length > 0) {
    config.mcp = mergedMcp
  }

  const rendered = `${JSON.stringify(config, null, 2)}\n`
  await writeFile(configPath, rendered, "utf8")

  return {
    configPath,
    source: rendered,
    mergedMcpKeys: Object.keys(mergedMcp).sort((left, right) => left.localeCompare(right)),
  }
}
