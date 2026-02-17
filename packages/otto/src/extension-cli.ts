import os from "node:os"
import path from "node:path"

import {
  disableExtension,
  installExtension,
  listExtensions,
  removeExtension,
  updateAllExtensions,
  updateExtension,
} from "./extensions/index.js"

type CliStreams = {
  stdout: Pick<Console, "log">
  stderr: Pick<Console, "error">
}

type ExtensionCliEnvironment = NodeJS.ProcessEnv

const resolveDefaultCatalogRoot = (): string => {
  const currentFileDirectory = path.dirname(decodeURIComponent(new URL(import.meta.url).pathname))
  return path.join(currentFileDirectory, "assets", "extensions", "catalog")
}

const usage = `Usage: extension-cli <command> [options]

Commands:
  list
  install <id>[@version]
  update <id>
  update --all
  disable <id>
  remove <id>[@version]
`

const printList = (
  value: Awaited<ReturnType<typeof listExtensions>>,
  stdout: Pick<Console, "log">
) => {
  stdout.log("Catalog:")
  if (value.catalog.length === 0) {
    stdout.log("- (empty)")
  } else {
    for (const entry of value.catalog) {
      stdout.log(
        `- ${entry.id}: latest=${entry.latestVersion} versions=${entry.versions.join(",")}`
      )
    }
  }

  stdout.log("")
  stdout.log("Installed:")
  if (value.installed.length === 0) {
    stdout.log("- (none)")
    return
  }

  for (const installed of value.installed) {
    const status = installed.upToDate ? "up-to-date" : "update-available"
    const latest = installed.latestCatalogVersion ?? "n/a"
    stdout.log(`- ${installed.id}@${installed.version} latest=${latest} ${status}`)
  }
}

/**
 * Runs extension operator CLI commands independently from runtime boot command parsing so
 * `ottoctl extension ...` can evolve as an operator surface without affecting runtime modes.
 *
 * @param args CLI arguments after `extension`.
 * @param streams Output streams used by command execution.
 * @param environment Environment values for Otto home and catalog root.
 * @returns Process exit code.
 */
export const runExtensionCliCommand = async (
  args: string[],
  streams: CliStreams = { stdout: console, stderr: console },
  environment: ExtensionCliEnvironment = process.env
): Promise<number> => {
  const [command, ...rest] = args
  const ottoHome = environment.OTTO_HOME ?? path.join(os.homedir(), ".otto")
  const catalogRoot = environment.OTTO_EXTENSION_CATALOG_ROOT ?? resolveDefaultCatalogRoot()
  const context = {
    ottoHome,
    catalogRoot,
  }

  try {
    if (!command || command === "help" || command === "--help" || command === "-h") {
      streams.stdout.log(usage)
      return 0
    }

    if (command === "list") {
      if (rest.length > 0) {
        throw new Error("Usage: extension-cli list")
      }

      const result = await listExtensions(context)
      printList(result, streams.stdout)
      return 0
    }

    if (command === "install") {
      const target = rest[0]
      if (!target || rest.length > 1) {
        throw new Error("Usage: extension-cli install <id>[@version]")
      }

      const result = await installExtension(context, target)
      const mode = result.wasAlreadyInstalled ? "(already installed)" : ""
      streams.stdout.log(
        `Installed and activated ${result.id}@${result.installedVersion} ${mode}`.trim()
      )
      if (result.prunedVersions.length > 0) {
        streams.stdout.log(`Pruned older versions: ${result.prunedVersions.join(", ")}`)
      }
      return 0
    }

    if (command === "update") {
      if (rest[0] === "--all") {
        if (rest.length > 1) {
          throw new Error("Usage: extension-cli update --all")
        }

        const results = await updateAllExtensions(context)
        if (results.length === 0) {
          streams.stdout.log("No installed extensions to update")
          return 0
        }

        for (const result of results) {
          streams.stdout.log(`Updated and activated ${result.id}@${result.installedVersion}`)
        }
        return 0
      }

      const extensionId = rest[0]
      if (!extensionId || rest.length > 1) {
        throw new Error("Usage: extension-cli update <id>")
      }

      const result = await updateExtension(context, extensionId)
      streams.stdout.log(`Updated and activated ${result.id}@${result.installedVersion}`)
      if (result.prunedVersions.length > 0) {
        streams.stdout.log(`Pruned older versions: ${result.prunedVersions.join(", ")}`)
      }
      return 0
    }

    if (command === "disable") {
      const extensionId = rest[0]
      if (!extensionId || rest.length > 1 || extensionId.includes("@")) {
        throw new Error("Usage: extension-cli disable <id>")
      }

      const result = await disableExtension(context, extensionId)
      streams.stdout.log(`Disabled ${result.id}@${result.removedVersion}`)
      return 0
    }

    if (command === "remove") {
      const target = rest[0]
      if (!target || rest.length > 1) {
        throw new Error("Usage: extension-cli remove <id>[@version]")
      }

      const result = await removeExtension(context, target)
      streams.stdout.log(`Removed ${result.id}@${result.removedVersion}`)
      return 0
    }

    throw new Error(`Unknown extension command: ${command}`)
  } catch (error) {
    const err = error as Error
    streams.stderr.error(err.message)
    return 1
  }
}

const isMainModule = process.argv[1]
  ? path.resolve(process.argv[1]) ===
    path.resolve(decodeURIComponent(new URL(import.meta.url).pathname))
  : false

if (isMainModule) {
  runExtensionCliCommand(process.argv.slice(2))
    .then((exitCode) => {
      process.exitCode = exitCode
    })
    .catch((error) => {
      const err = error as Error
      console.error(err.message)
      process.exitCode = 1
    })
}
