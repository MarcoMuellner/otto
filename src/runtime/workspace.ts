import path from "node:path"
import { access, copyFile, mkdir } from "node:fs/promises"
import { constants } from "node:fs"
import { fileURLToPath } from "node:url"

const WORKSPACE_SUBDIRECTORIES = ["data", "inbox", "scripts", "secrets", "logs"] as const
const ASSET_FILES = ["opencode.jsonc", "AGENTS.md"] as const

export const resolveAssetDirectory = (importMetaUrl: string): string => {
  return fileURLToPath(new URL("../assets", importMetaUrl))
}

export const getWorkspaceDirectories = (ottoHome: string): string[] => {
  return WORKSPACE_SUBDIRECTORIES.map((directory) => path.join(ottoHome, directory))
}

export const ensureWorkspaceDirectories = async (ottoHome: string): Promise<string[]> => {
  const directories = [ottoHome, ...getWorkspaceDirectories(ottoHome)]

  await Promise.all(directories.map((directory) => mkdir(directory, { recursive: true })))

  return directories
}

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
