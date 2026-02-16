import type { Logger } from "pino"

import { ensureOttoConfigFile } from "../config/otto-config.js"
import {
  deployWorkspaceAssets,
  ensureWorkspaceDirectories,
  resolveAssetDirectory,
} from "./workspace.js"

export type SetupResult = {
  configPath: string
  createdConfig: boolean
  deployedFiles: string[]
  directories: string[]
}

export const runSetup = async (
  logger: Logger,
  homeDirectory?: string,
  assetDirectory = resolveAssetDirectory(import.meta.url)
): Promise<SetupResult> => {
  const { config, configPath, created } = await ensureOttoConfigFile(homeDirectory)

  const directories = await ensureWorkspaceDirectories(config.ottoHome)
  const deployedFiles = await deployWorkspaceAssets(assetDirectory, config.ottoHome)

  logger.info(
    {
      command: "setup",
      configPath,
      ottoHome: config.ottoHome,
      createdConfig: created,
      deployedCount: deployedFiles.length,
    },
    "Otto setup completed"
  )

  return {
    configPath,
    createdConfig: created,
    deployedFiles,
    directories,
  }
}
