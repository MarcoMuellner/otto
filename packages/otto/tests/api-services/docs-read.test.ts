import { createServer, type Server } from "node:http"

import { afterEach, describe, expect, it } from "vitest"

import { DocsReadError, openDocs, searchDocs } from "../../src/api-services/docs-read.js"

const activeServers: Server[] = []

const listen = async (server: Server): Promise<{ baseUrl: string }> => {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => resolve())
  })

  activeServers.push(server)
  const address = server.address()
  if (!address || typeof address === "string") {
    throw new Error("Unable to resolve server port")
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
  }
}

afterEach(async () => {
  await Promise.all(
    activeServers.splice(0).map(
      async (server) =>
        await new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) {
              reject(error)
              return
            }

            resolve()
          })
        })
    )
  )
})

describe("docs-read api service", () => {
  it("searches docs via docs service endpoint", async () => {
    const { baseUrl } = await listen(
      createServer((request, response) => {
        if (request.url?.startsWith("/api/docs/search")) {
          response.statusCode = 200
          response.setHeader("content-type", "application/json")
          response.end(
            JSON.stringify({
              query: "intro",
              version: null,
              results: [
                {
                  version: "current",
                  slug: "/docs/intro",
                  url: "/docs/intro/",
                  title: "Intro",
                  snippet: "Start here",
                  sections: [{ anchor: "quickstart", title: "Quickstart" }],
                },
              ],
            })
          )
          return
        }

        response.statusCode = 404
        response.end()
      })
    )

    const result = await searchDocs({
      query: "intro",
      environment: {
        OTTO_DOCS_SERVICE_URL: baseUrl,
      },
    })

    expect(result.results[0]).toMatchObject({
      slug: "/docs/intro",
      version: "current",
    })
  })

  it("preserves docs service base path when OTTO_DOCS_SERVICE_URL includes one", async () => {
    const { baseUrl } = await listen(
      createServer((request, response) => {
        if (request.url?.startsWith("/docs-service/api/docs/search")) {
          response.statusCode = 200
          response.setHeader("content-type", "application/json")
          response.end(
            JSON.stringify({
              query: "intro",
              version: null,
              results: [],
            })
          )
          return
        }

        response.statusCode = 404
        response.end()
      })
    )

    const result = await searchDocs({
      query: "intro",
      environment: {
        OTTO_DOCS_SERVICE_URL: `${baseUrl}/docs-service`,
      },
    })

    expect(result.results).toHaveLength(0)
  })

  it("opens /live docs and auto-fetches authenticated live data", async () => {
    const { baseUrl } = await listen(
      createServer((request, response) => {
        if (request.url?.startsWith("/api/docs/open")) {
          response.statusCode = 200
          response.setHeader("content-type", "application/json")
          response.end(
            JSON.stringify({
              page: {
                version: "current",
                slug: "/live",
                url: "/live/",
                title: "Live Runtime",
                snippet: "Live status",
              },
              section: null,
              sections: [{ anchor: "auth", title: "Authentication" }],
            })
          )
          return
        }

        if (request.url === "/api/live/self-awareness") {
          expect(request.headers.authorization).toBe("Bearer token-123")
          response.statusCode = 200
          response.setHeader("content-type", "application/json")
          response.end(JSON.stringify({ generatedAt: 123, state: { status: "ok" } }))
          return
        }

        response.statusCode = 404
        response.end()
      })
    )

    const result = await openDocs({
      slug: "/live",
      environment: {
        OTTO_DOCS_SERVICE_URL: baseUrl,
        OTTO_EXTERNAL_API_TOKEN: "token-123",
      },
    })

    expect(result.page.slug).toBe("/live")
    expect(result.liveData).toMatchObject({ state: { status: "ok" } })
  })

  it("maps docs-service version mismatch errors", async () => {
    const { baseUrl } = await listen(
      createServer((request, response) => {
        if (request.url?.startsWith("/api/docs/open")) {
          response.statusCode = 409
          response.setHeader("content-type", "application/json")
          response.end(
            JSON.stringify({
              error: "version_mismatch",
              message: "Requested docs version is unavailable.",
              details: { availableVersions: ["current", "v1.2.3"] },
            })
          )
          return
        }

        response.statusCode = 404
        response.end()
      })
    )

    await expect(
      openDocs({
        slug: "/docs/intro",
        version: "v9.9.9",
        environment: {
          OTTO_DOCS_SERVICE_URL: baseUrl,
        },
      })
    ).rejects.toMatchObject({
      name: "DocsReadError",
      code: "version_mismatch",
      statusCode: 409,
    } satisfies Partial<DocsReadError>)
  })

  it("maps upstream unauthorized live errors to auth_required", async () => {
    const { baseUrl } = await listen(
      createServer((request, response) => {
        if (request.url?.startsWith("/api/docs/open")) {
          response.statusCode = 200
          response.setHeader("content-type", "application/json")
          response.end(
            JSON.stringify({
              page: {
                version: "current",
                slug: "/live",
                url: "/live/",
                title: "Live Runtime",
                snippet: "Live status",
              },
              section: null,
              sections: [],
            })
          )
          return
        }

        if (request.url === "/api/live/self-awareness") {
          response.statusCode = 401
          response.setHeader("content-type", "application/json")
          response.end(
            JSON.stringify({
              error: "unauthorized",
              message: "Invalid token",
            })
          )
          return
        }

        response.statusCode = 404
        response.end()
      })
    )

    await expect(
      openDocs({
        slug: "/live",
        environment: {
          OTTO_DOCS_SERVICE_URL: baseUrl,
          OTTO_EXTERNAL_API_TOKEN: "bad-token",
        },
      })
    ).rejects.toMatchObject({
      name: "DocsReadError",
      code: "auth_required",
      statusCode: 401,
    } satisfies Partial<DocsReadError>)
  })
})
