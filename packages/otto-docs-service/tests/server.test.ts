import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { startDocsServer } from "../src/server.js";

const createTempSite = async (): Promise<string> => {
  const siteDir = await mkdtemp(path.join(tmpdir(), "otto-docs-service-test-"));
  await writeFile(
    path.join(siteDir, "index.html"),
    "<html><body>docs</body></html>",
    "utf8",
  );
  return siteDir;
};

const listen = async (
  server: Server,
): Promise<{ port: number; close: () => Promise<void> }> => {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Unable to resolve test server port");
  }

  return {
    port: address.port,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    },
  };
};

const waitForDocsReady = async (baseUrl: string): Promise<void> => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/`);
      if (response.status === 200) {
        return;
      }
    } catch {
      // no-op: retry
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  throw new Error("Docs service did not become ready");
};

const waitForListeningPort = async (
  readPort: () => number,
): Promise<number> => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const port = readPort();
    if (port > 0) {
      return port;
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  throw new Error("Docs service did not expose listening port");
};

describe("docs-service live proxy", () => {
  const cleanupPaths: string[] = [];
  const cleanupServers: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanupServers.length > 0) {
      const close = cleanupServers.pop();
      if (close) {
        await close();
      }
    }

    while (cleanupPaths.length > 0) {
      const dir = cleanupPaths.pop();
      if (dir) {
        await rm(dir, { recursive: true, force: true });
      }
    }
  });

  it("returns unauthorized when bearer token is missing", async () => {
    const siteDir = await createTempSite();
    cleanupPaths.push(siteDir);

    const upstream = await listen(
      createServer((_request, response) => {
        response.statusCode = 200;
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.end(JSON.stringify({ ok: true }));
      }),
    );
    cleanupServers.push(upstream.close);

    const docs = startDocsServer({
      host: "127.0.0.1",
      port: 0,
      basePath: "/",
      siteDirectory: siteDir,
      externalApiBaseUrl: `http://127.0.0.1:${upstream.port}`,
    });
    cleanupServers.push(docs.close);

    const docsPort = await waitForListeningPort(() => docs.port);
    await waitForDocsReady(`http://127.0.0.1:${docsPort}`);

    const response = await fetch(
      `http://127.0.0.1:${docsPort}/api/live/self-awareness`,
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toMatchObject({ error: "unauthorized" });
  });

  it("forwards authorized requests to external API live endpoint", async () => {
    const siteDir = await createTempSite();
    cleanupPaths.push(siteDir);

    const upstream = await listen(
      createServer((request, response) => {
        if (
          request.url === "/external/self-awareness/live" &&
          request.headers.authorization === "Bearer good-token"
        ) {
          response.statusCode = 200;
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.end(
            JSON.stringify({
              state: {
                status: "ok",
                checkedAt: 1,
                runtime: {
                  version: "1.0.0",
                  pid: 12,
                  startedAt: 1,
                  uptimeSec: 10,
                },
              },
              processes: [],
              limits: {
                scheduler: {
                  enabled: true,
                  tickMs: 2000,
                  batchSize: 5,
                  lockLeaseMs: 30000,
                },
                pagination: {
                  auditMax: 100,
                  runsMax: 100,
                  defaultListLimit: 20,
                },
                profile: {
                  interactiveContextWindowSize: { min: 0, max: 10, current: 4 },
                  contextRetentionCap: { min: 0, max: 10, current: 4 },
                },
              },
              recentDecisions: [],
              openRisks: [],
              generatedAt: 1,
              sources: [],
            }),
          );
          return;
        }

        response.statusCode = 401;
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.end(JSON.stringify({ error: "unauthorized" }));
      }),
    );
    cleanupServers.push(upstream.close);

    const docs = startDocsServer({
      host: "127.0.0.1",
      port: 0,
      basePath: "/",
      siteDirectory: siteDir,
      externalApiBaseUrl: `http://127.0.0.1:${upstream.port}`,
    });
    cleanupServers.push(docs.close);

    const docsPort = await waitForListeningPort(() => docs.port);
    await waitForDocsReady(`http://127.0.0.1:${docsPort}`);

    const response = await fetch(
      `http://127.0.0.1:${docsPort}/api/live/self-awareness`,
      {
        headers: {
          Authorization: "Bearer good-token",
        },
      },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.state.runtime.version).toBe("1.0.0");
  });

  it("allows repeated close calls during shutdown", async () => {
    const siteDir = await createTempSite();
    cleanupPaths.push(siteDir);

    const upstream = await listen(
      createServer((_request, response) => {
        response.statusCode = 200;
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.end(JSON.stringify({ ok: true }));
      }),
    );
    cleanupServers.push(upstream.close);

    const docs = startDocsServer({
      host: "127.0.0.1",
      port: 0,
      basePath: "/",
      siteDirectory: siteDir,
      externalApiBaseUrl: `http://127.0.0.1:${upstream.port}`,
    });

    await waitForListeningPort(() => docs.port);

    await Promise.all([docs.close(), docs.close()]);
  });
});
