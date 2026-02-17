import { cp, mkdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(scriptDirectory, "..")
const sourceDirectory = path.join(projectRoot, "src", "assets")
const targetDirectory = path.join(projectRoot, "dist", "assets")
const extensionCatalogSourceDirectory = path.resolve(
  projectRoot,
  "..",
  "otto-extensions",
  "extensions"
)
const extensionCatalogTargetDirectory = path.join(targetDirectory, "extensions", "catalog")

await mkdir(targetDirectory, { recursive: true })
await cp(sourceDirectory, targetDirectory, { recursive: true })
await mkdir(path.dirname(extensionCatalogTargetDirectory), { recursive: true })
await cp(extensionCatalogSourceDirectory, extensionCatalogTargetDirectory, { recursive: true })
