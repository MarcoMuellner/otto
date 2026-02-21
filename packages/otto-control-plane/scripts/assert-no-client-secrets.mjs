import { readdir, readFile, stat } from "node:fs/promises"
import path from "node:path"

const CLIENT_BUILD_ROOT = path.resolve(process.cwd(), "build", "client")
const SUSPICIOUS_MARKERS = [
  "OTTO_EXTERNAL_API_TOKEN",
  "OTTO_EXTERNAL_API_TOKEN_FILE",
  "internal-api.token",
]

const listFilesRecursively = async (directoryPath) => {
  const entries = await readdir(directoryPath)
  const files = []

  for (const entry of entries) {
    const fullPath = path.join(directoryPath, entry)
    const fileStats = await stat(fullPath)

    if (fileStats.isDirectory()) {
      const childFiles = await listFilesRecursively(fullPath)
      files.push(...childFiles)
      continue
    }

    files.push(fullPath)
  }

  return files
}

const main = async () => {
  const files = await listFilesRecursively(CLIENT_BUILD_ROOT)
  const markerHits = []

  for (const filePath of files) {
    const source = await readFile(filePath, "utf8")

    for (const marker of SUSPICIOUS_MARKERS) {
      if (source.includes(marker)) {
        markerHits.push({ filePath, marker })
      }
    }
  }

  if (markerHits.length > 0) {
    for (const hit of markerHits) {
      console.error(`Potential secret marker found in client build: ${hit.marker} (${hit.filePath})`)
    }

    process.exitCode = 1
    return
  }

  process.stdout.write("Control-plane client build secret scan passed\n")
}

main().catch((error) => {
  const err = error instanceof Error ? error : new Error(String(error))
  console.error(`Client secret scan failed: ${err.message}`)
  process.exitCode = 1
})
