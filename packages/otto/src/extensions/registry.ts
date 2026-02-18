import { createHash } from "node:crypto"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import semver from "semver"
import * as tar from "tar"
import { z } from "zod"

const registryIndexSchema = z.object({
  registryVersion: z.literal(1),
  generatedAt: z.string().trim().min(1),
  extensions: z.record(
    z.string().trim().min(1),
    z.object({
      latest: z.string().trim().min(1),
      versions: z.record(
        z.string().trim().min(1),
        z.object({
          archiveUrl: z.string().url(),
          sha256: z.string().regex(/^[a-f0-9]{64}$/),
          sizeBytes: z.number().int().positive(),
          compatibility: z
            .object({
              otto: z.string().trim().min(1).optional(),
              node: z.string().trim().min(1).optional(),
            })
            .optional(),
          description: z.string().trim().min(1),
          payloadTypes: z.array(z.string().trim().min(1)).default([]),
        })
      ),
    })
  ),
})

export type ExtensionRegistryIndex = z.infer<typeof registryIndexSchema>
export type ExtensionRegistryEntry = {
  id: string
  version: string
  latestVersion: string
  archiveUrl: string
  sha256: string
  description: string
  payloadTypes: string[]
}

export const DEFAULT_EXTENSION_REGISTRY_URL =
  "https://raw.githubusercontent.com/MarcoMuellner/otto/main/packages/otto-extensions/registry/index.json"

/**
 * Fetches and validates the remote extension registry index so extension install/update
 * behavior can ship independently from Otto binary releases.
 *
 * @param registryUrl Absolute URL to the registry index JSON.
 * @returns Parsed and validated registry index.
 */
export const fetchExtensionRegistryIndex = async (
  registryUrl: string
): Promise<ExtensionRegistryIndex> => {
  const response = await fetch(registryUrl)
  if (!response.ok) {
    throw new Error(`Failed to fetch extension registry (${response.status}) from ${registryUrl}`)
  }

  const payload = (await response.json()) as unknown
  const parsed = registryIndexSchema.safeParse(payload)
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
      .join("; ")
    throw new Error(`Invalid extension registry index at ${registryUrl}: ${detail}`)
  }

  return parsed.data
}

/**
 * Resolves an extension version from registry index using latest semantics when version is
 * omitted, while enforcing semver validity for deterministic operator behavior.
 *
 * @param index Parsed registry index.
 * @param extensionId Extension id to resolve.
 * @param version Optional explicit extension version.
 * @returns Concrete resolved registry entry.
 */
export const resolveRegistryEntry = (
  index: ExtensionRegistryIndex,
  extensionId: string,
  version: string | null
): ExtensionRegistryEntry => {
  const extension = index.extensions[extensionId]
  if (!extension) {
    throw new Error(`Extension '${extensionId}' is not present in registry`)
  }

  const versions = Object.keys(extension.versions)
  if (versions.length === 0) {
    throw new Error(`Extension '${extensionId}' has no published versions in registry`)
  }

  const selectedVersion = version ?? extension.latest
  const selected = extension.versions[selectedVersion]
  if (!selected) {
    throw new Error(`Extension '${extensionId}@${selectedVersion}' is not present in registry`)
  }

  if (!semver.valid(selectedVersion)) {
    throw new Error(`Registry entry '${extensionId}@${selectedVersion}' is not valid semver`)
  }

  if (!semver.valid(extension.latest)) {
    throw new Error(`Registry latest version for '${extensionId}' is invalid semver`)
  }

  return {
    id: extensionId,
    version: selectedVersion,
    latestVersion: extension.latest,
    archiveUrl: selected.archiveUrl,
    sha256: selected.sha256,
    description: selected.description,
    payloadTypes: selected.payloadTypes,
  }
}

/**
 * Lists registry extensions grouped by id for CLI list output and update planning.
 *
 * @param index Parsed registry index.
 * @returns Sorted extension summaries with latest-first semver ordering.
 */
export const listRegistryExtensions = (
  index: ExtensionRegistryIndex
): Array<{ id: string; latestVersion: string; versions: string[] }> => {
  return Object.entries(index.extensions)
    .map(([id, extension]) => {
      const versions = Object.keys(extension.versions).sort((left, right) =>
        semver.rcompare(left, right)
      )

      return {
        id,
        latestVersion: extension.latest,
        versions,
      }
    })
    .sort((left, right) => left.id.localeCompare(right.id))
}

/**
 * Downloads, verifies, and extracts a registry extension archive into a target path.
 *
 * @param entry Resolved registry entry metadata.
 * @param targetPath Absolute destination path for extracted extension files.
 */
export const installRegistryArchiveToPath = async (
  entry: ExtensionRegistryEntry,
  targetPath: string
): Promise<void> => {
  const response = await fetch(entry.archiveUrl)
  if (!response.ok) {
    throw new Error(
      `Failed to download extension archive for '${entry.id}@${entry.version}' (${response.status})`
    )
  }

  const arrayBuffer = await response.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const computedChecksum = createHash("sha256").update(buffer).digest("hex")
  if (computedChecksum !== entry.sha256) {
    throw new Error(
      `Checksum mismatch for '${entry.id}@${entry.version}': expected ${entry.sha256}, got ${computedChecksum}`
    )
  }

  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "otto-extension-archive-"))
  const archivePath = path.join(temporaryDirectory, `${entry.id}-${entry.version}.tgz`)

  try {
    await mkdir(targetPath, { recursive: true })
    await writeFile(archivePath, buffer)
    await tar.x({
      file: archivePath,
      cwd: targetPath,
      strip: 1,
    })

    const manifestPath = path.join(targetPath, "manifest.jsonc")
    await readFile(manifestPath, "utf8")
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true })
  }
}
