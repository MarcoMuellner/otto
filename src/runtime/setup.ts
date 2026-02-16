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

/**
 * Keeps install/update responsibilities explicit by preparing config, workspace, and assets
 * in one command, so normal runtime boot can stay side-effect free.
 *
 * @param logger Command-scoped logger for setup telemetry.
 * @param homeDirectory Optional home override used by tests and embedding.
 * @param assetDirectory Optional asset location override for advanced packaging.
 * @returns Summary of setup outputs for diagnostics and tests.
 */
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
