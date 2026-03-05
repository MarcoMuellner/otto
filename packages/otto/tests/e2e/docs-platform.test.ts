import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { createServer, type Server } from "node:http"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import { startDocsServer } from "../../../otto-docs-service/src/server.js"
import { openDocs, searchDocs } from "../../src/api-services/docs-read.js"

const cleanupPaths: string[] = []
const cleanupServers: Array<() => Promise<void>> = []

const createFixtureSite = async (): Promise<string> => {
  const siteDir = await mkdtemp(path.join(tmpdir(), "otto-docs-e2e-"))
  await mkdir(path.join(siteDir, "docs", "intro"), { recursive: true })
  await mkdir(path.join(siteDir, "live"), { recursive: true })

  await writeFile(
    path.join(siteDir, "docs", "intro", "index.html"),
    `<!doctype html><html><head><title>Otto Intro</title><meta name="description" content="Operator quickstart for Otto docs"></head><body><h1>Otto Intro</h1><h2 id="quickstart">Quickstart</h2><p>Learn setup and run commands.</p></body></html>`,
    "utf8"
  )

  await writeFile(
    path.join(siteDir, "live", "index.html"),
    `<!doctype html><html><head><title>Live Runtime</title><meta name="description" content="Live status and self-awareness"></head><body><h1>Live Runtime</h1><h2 id="auth">Authentication</h2></body></html>`,
    "utf8"
  )

  await writeFile(path.join(siteDir, "index.html"), "<html><body>docs</body></html>", "utf8")
  return siteDir
}

const listen = async (server: Server): Promise<{ port: number; close: () => Promise<void> }> => {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => resolve())
  })

  const address = server.address()
  if (!address || typeof address === "string") {
    throw new Error("Unable to resolve test server port")
  }

  return {
    port: address.port,
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

const waitForListeningPort = async (readPort: () => number): Promise<number> => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const port = readPort()
    if (port > 0) {
      return port
    }

    await new Promise((resolve) => setTimeout(resolve, 20))
  }

  throw new Error("Docs service did not expose listening port")
}

afterEach(async () => {
  while (cleanupServers.length > 0) {
    const close = cleanupServers.pop()
    if (close) {
      await close()
    }
  }

  while (cleanupPaths.length > 0) {
    const dir = cleanupPaths.pop()
    if (dir) {
      await rm(dir, { recursive: true, force: true })
    }
  }
})

describe("docs platform e2e hardening", () => {
  it("validates operator journey across static docs and authenticated live boundary", async () => {
    const siteDir = await createFixtureSite()
    cleanupPaths.push(siteDir)

    const upstream = await listen(
      createServer((request, response) => {
        if (
          request.url === "/external/self-awareness/live" &&
          request.headers.authorization === "Bearer good-token"
        ) {
          response.statusCode = 200
          response.setHeader("Content-Type", "application/json; charset=utf-8")
          response.end(JSON.stringify({ state: { status: "ok" }, generatedAt: Date.now() }))
          return
        }

        response.statusCode = 401
        response.setHeader("Content-Type", "application/json; charset=utf-8")
        response.end(JSON.stringify({ error: "unauthorized", message: "Invalid token" }))
      })
    )
    cleanupServers.push(upstream.close)

    const docs = startDocsServer({
      host: "127.0.0.1",
      port: 0,
      basePath: "/",
      siteDirectory: siteDir,
      externalApiBaseUrl: `http://127.0.0.1:${upstream.port}`,
    })
    cleanupServers.push(docs.close)

    const docsPort = await waitForListeningPort(() => docs.port)
    const baseUrl = `http://127.0.0.1:${docsPort}`

    const staticResponse = await fetch(`${baseUrl}/docs/intro/`)
    expect(staticResponse.status).toBe(200)
    expect(await staticResponse.text()).toContain("Otto Intro")

    const unauthResponse = await fetch(`${baseUrl}/api/live/self-awareness`)
    expect(unauthResponse.status).toBe(401)
    expect(await unauthResponse.json()).toMatchObject({ error: "auth_required" })

    const authorizedResponse = await fetch(`${baseUrl}/api/live/self-awareness`, {
      headers: {
        Authorization: "Bearer good-token",
      },
    })
    expect(authorizedResponse.status).toBe(200)
    expect(await authorizedResponse.json()).toMatchObject({ state: { status: "ok" } })
  })

  it("returns explicit failure signals when live upstream is unreachable", async () => {
    const siteDir = await createFixtureSite()
    cleanupPaths.push(siteDir)

    const docs = startDocsServer({
      host: "127.0.0.1",
      port: 0,
      basePath: "/",
      siteDirectory: siteDir,
      externalApiBaseUrl: "http://127.0.0.1:9",
    })
    cleanupServers.push(docs.close)

    const docsPort = await waitForListeningPort(() => docs.port)
    const baseUrl = `http://127.0.0.1:${docsPort}`

    const response = await fetch(`${baseUrl}/api/live/self-awareness`, {
      headers: {
        Authorization: "Bearer good-token",
      },
    })

    expect(response.status).toBe(502)
    expect(await response.json()).toMatchObject({ error: "upstream_unreachable" })
  })

  it("validates Otto self-query journey through docs search and docs open", async () => {
    const siteDir = await createFixtureSite()
    cleanupPaths.push(siteDir)

    const upstream = await listen(
      createServer((request, response) => {
        if (
          request.url === "/external/self-awareness/live" &&
          request.headers.authorization === "Bearer good-token"
        ) {
          response.statusCode = 200
          response.setHeader("Content-Type", "application/json; charset=utf-8")
          response.end(
            JSON.stringify({
              generatedAt: Date.now(),
              state: { status: "ok" },
            })
          )
          return
        }

        response.statusCode = 401
        response.setHeader("Content-Type", "application/json; charset=utf-8")
        response.end(JSON.stringify({ error: "unauthorized", message: "Invalid token" }))
      })
    )
    cleanupServers.push(upstream.close)

    const docs = startDocsServer({
      host: "127.0.0.1",
      port: 0,
      basePath: "/",
      siteDirectory: siteDir,
      externalApiBaseUrl: `http://127.0.0.1:${upstream.port}`,
    })
    cleanupServers.push(docs.close)

    const docsPort = await waitForListeningPort(() => docs.port)
    const environment = {
      OTTO_DOCS_SERVICE_URL: `http://127.0.0.1:${docsPort}`,
      OTTO_EXTERNAL_API_TOKEN: "good-token",
    }

    const searchResult = await searchDocs({
      query: "quickstart",
      limit: 5,
      environment,
    })
    expect(searchResult.results[0]).toMatchObject({
      slug: "/docs/intro",
      version: "current",
    })

    const openResult = await openDocs({
      slug: "/docs/intro",
      section: "quickstart",
      environment,
    })
    expect(openResult.page).toMatchObject({
      slug: "/docs/intro",
      version: "current",
    })
    expect(openResult.section).toMatchObject({ anchor: "quickstart" })
    expect(openResult.liveData).toBeNull()

    const liveResult = await openDocs({
      slug: "/live",
      environment,
    })
    expect(liveResult.page.slug).toBe("/live")
    expect(liveResult.liveData).toMatchObject({ state: { status: "ok" } })
  })
})
