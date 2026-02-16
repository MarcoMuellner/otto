import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(scriptDirectory, "..")
const packageJsonPath = path.join(projectRoot, "package.json")
const versionFilePath = path.join(projectRoot, "src", "version.ts")

const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"))

const cliVersion = process.argv[2]
const envVersion = process.env.OTTO_BUILD_VERSION
const fallbackVersion = `${packageJson.version}-dev`
const version = cliVersion || envVersion || fallbackVersion

const source = `/**
 * Stores the build version embedded into Otto artifacts so runtime logs and support reports
 * can always identify the exact release flavor in use.
 */
export const APP_VERSION = ${JSON.stringify(version)}

/**
 * Exposes a single version accessor so callers do not depend on where build metadata is stored.
 *
 * @returns Build version identifier embedded during build.
 */
export const getAppVersion = (): string => {
  return APP_VERSION
}
`

await writeFile(versionFilePath, source, "utf8")
