import path from "node:path"
import { access, copyFile, mkdir } from "node:fs/promises"
import { constants } from "node:fs"

const WORKSPACE_SUBDIRECTORIES = ["data", "inbox", "scripts", "secrets", "logs"] as const
const ASSET_FILES = ["opencode.jsonc", "AGENTS.md"] as const

/**
 * Resolves assets relative to the active runtime entry so setup can locate bundled assets
 * in release installs and source assets in local development without extra configuration.
 *
 * @param runtimeEntryPath Runtime entry path, defaults to the current process entrypoint.
 * @returns Absolute path to the runtime asset directory.
 */
export const resolveAssetDirectory = (runtimeEntryPath = process.argv[1]): string => {
  if (runtimeEntryPath) {
    return path.join(path.dirname(path.resolve(runtimeEntryPath)), "assets")
  }

  return path.resolve("dist", "assets")
}

/**
 * Keeps workspace structure explicit in one place so setup and tests share the same
 * directory contract.
 *
 * @param ottoHome Otto workspace root path.
 * @returns Required Otto subdirectory paths.
 */
export const getWorkspaceDirectories = (ottoHome: string): string[] => {
  return WORKSPACE_SUBDIRECTORIES.map((directory) => path.join(ottoHome, directory))
}

/**
 * Ensures required workspace paths exist ahead of setup operations so follow-up deploy
 * steps can assume a stable filesystem layout.
 *
 * @param ottoHome Otto workspace root path.
 * @returns Created or verified directory paths.
 */
export const ensureWorkspaceDirectories = async (ottoHome: string): Promise<string[]> => {
  const directories = [ottoHome, ...getWorkspaceDirectories(ottoHome)]

  await Promise.all(directories.map((directory) => mkdir(directory, { recursive: true })))

  return directories
}

/**
 * Deploys shipped assets into Otto home so runtime uses a deterministic local config that
 * can still be edited by the user after setup.
 *
 * @param assetDirectory Directory containing deployable assets.
 * @param ottoHome Otto workspace root path.
 * @returns Paths of deployed asset files.
 */
export const deployWorkspaceAssets = async (
  assetDirectory: string,
  ottoHome: string
): Promise<string[]> => {
  const deployedFiles: string[] = []

  for (const assetFile of ASSET_FILES) {
    const sourcePath = path.join(assetDirectory, assetFile)
    const targetPath = path.join(ottoHome, assetFile)

    await access(sourcePath, constants.F_OK)
    await copyFile(sourcePath, targetPath)

    deployedFiles.push(targetPath)
  }

  return deployedFiles
}
