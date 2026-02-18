import { createHash } from "node:crypto"
import { createServer } from "node:http"
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises"
import path from "node:path"

import * as tar from "tar"

type RegistryVersionRecord = {
  archiveUrl: string
  sha256: string
  sizeBytes: number
  description: string
  payloadTypes: string[]
}

type RegistryIndex = {
  registryVersion: 1
  generatedAt: string
  extensions: Record<
    string,
    {
      latest: string
      versions: Record<string, RegistryVersionRecord>
    }
  >
}

type PublishOptions = {
  description?: string
}

export type RegistryHarness = {
  registryUrl: string
  publishExtensionVersion: (id: string, version: string, options?: PublishOptions) => Promise<void>
  close: () => Promise<void>
}

const writeJson = async (filePath: string, payload: unknown): Promise<void> => {
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8")
}

const ensureExtensionSource = async (
  sourcesRoot: string,
  extensionId: string,
  version: string,
  description: string
): Promise<string> => {
  const extensionRoot = path.join(sourcesRoot, extensionId, version, extensionId)
  await rm(path.join(sourcesRoot, extensionId, version), { recursive: true, force: true })
  await mkdir(path.join(extensionRoot, "tools"), { recursive: true })
  await mkdir(path.join(extensionRoot, "skills", `${extensionId}-skill`), { recursive: true })

  await writeFile(
    path.join(extensionRoot, "tools", `${extensionId}.ts`),
    "export default {}\n",
    "utf8"
  )
  await writeFile(
    path.join(extensionRoot, "skills", `${extensionId}-skill`, "SKILL.md"),
    `---\nname: ${extensionId}-skill\ndescription: Example skill for ${extensionId}\n---\n\nUse this skill.\n`,
    "utf8"
  )
  await writeFile(
    path.join(extensionRoot, "mcp.jsonc"),
    `${JSON.stringify(
      {
        [`${extensionId}-mcp`]: {
          type: "local",
          command: ["npx", "-y", "@playwright/mcp@latest", "--headless"],
          enabled: true,
        },
      },
      null,
      2
    )}\n`,
    "utf8"
  )
  await writeFile(
    path.join(extensionRoot, "manifest.jsonc"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        id: extensionId,
        name: `${extensionId} extension`,
        version,
        description,
        payload: {
          tools: {
            path: "tools",
          },
          skills: {
            path: "skills",
          },
          mcp: {
            file: "mcp.jsonc",
          },
        },
      },
      null,
      2
    )}\n`,
    "utf8"
  )

  return path.join(sourcesRoot, extensionId, version)
}

export const createRegistryHarness = async (rootDirectory: string): Promise<RegistryHarness> => {
  const registryRoot = path.join(rootDirectory, "registry")
  const artifactsRoot = path.join(registryRoot, "artifacts")
  const sourcesRoot = path.join(rootDirectory, "sources")
  const indexPath = path.join(registryRoot, "index.json")

  await mkdir(artifactsRoot, { recursive: true })
  await mkdir(sourcesRoot, { recursive: true })

  const index: RegistryIndex = {
    registryVersion: 1,
    generatedAt: new Date().toISOString(),
    extensions: {},
  }

  await writeJson(indexPath, index)

  const server = createServer(async (request, response) => {
    try {
      const requestUrl = request.url ?? "/"
      if (requestUrl === "/index.json") {
        const source = await readFile(indexPath)
        response.statusCode = 200
        response.setHeader("content-type", "application/json")
        response.end(source)
        return
      }

      if (!requestUrl.startsWith("/artifacts/")) {
        response.statusCode = 404
        response.end("not found")
        return
      }

      const artifactName = requestUrl.replace("/artifacts/", "")
      const artifactPath = path.join(artifactsRoot, artifactName)
      const source = await readFile(artifactPath)
      response.statusCode = 200
      response.setHeader("content-type", "application/gzip")
      response.end(source)
    } catch {
      response.statusCode = 404
      response.end("not found")
    }
  })

  await new Promise<void>((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => resolve())
    server.once("error", reject)
  })

  const address = server.address()
  if (!address || typeof address === "string") {
    throw new Error("Failed to resolve registry harness address")
  }

  const baseUrl = `http://127.0.0.1:${address.port}`

  const publishExtensionVersion = async (
    extensionId: string,
    version: string,
    options?: PublishOptions
  ): Promise<void> => {
    const description = options?.description ?? "Example extension"
    const sourceVersionRoot = await ensureExtensionSource(
      sourcesRoot,
      extensionId,
      version,
      description
    )

    const archiveName = `${extensionId}-${version}.tgz`
    const archivePath = path.join(artifactsRoot, archiveName)
    await tar.c(
      {
        gzip: true,
        file: archivePath,
        cwd: sourceVersionRoot,
      },
      [extensionId]
    )

    const archiveBuffer = await readFile(archivePath)
    const checksum = createHash("sha256").update(archiveBuffer).digest("hex")
    const sizeBytes = (await stat(archivePath)).size

    const existing = index.extensions[extensionId] ?? { latest: version, versions: {} }
    existing.versions[version] = {
      archiveUrl: `${baseUrl}/artifacts/${archiveName}`,
      sha256: checksum,
      sizeBytes,
      description,
      payloadTypes: ["tools", "skills", "mcp"],
    }
    existing.latest =
      Object.keys(existing.versions).sort((left, right) => semverCompare(right, left))[0] ?? version

    index.extensions[extensionId] = existing
    index.generatedAt = new Date().toISOString()

    await writeJson(indexPath, index)
  }

  return {
    registryUrl: `${baseUrl}/index.json`,
    publishExtensionVersion,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error)
            return
          }
          resolve()
        })
      })
    },
  }
}

const semverCompare = (left: string, right: string): number => {
  const [leftMajor, leftMinor, leftPatch] = left.split(".").map(Number)
  const [rightMajor, rightMinor, rightPatch] = right.split(".").map(Number)

  if (leftMajor !== rightMajor) {
    return leftMajor - rightMajor
  }
  if (leftMinor !== rightMinor) {
    return leftMinor - rightMinor
  }
  return leftPatch - rightPatch
}
