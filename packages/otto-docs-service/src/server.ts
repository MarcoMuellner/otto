import fs from "node:fs";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import path from "node:path";

import type { DocsServiceConfig } from "./config.js";

const contentTypes = new Map<string, string>([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".js", "application/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
  [".webp", "image/webp"],
]);

const log = (
  level: "info" | "warn" | "error",
  message: string,
  fields: Record<string, unknown> = {},
): void => {
  const line = {
    level,
    component: "docs-service",
    message,
    ...fields,
  };

  const rendered = JSON.stringify(line);
  if (level === "error") {
    process.stderr.write(`${rendered}\n`);
    return;
  }

  process.stdout.write(`${rendered}\n`);
};

const normalizeRequestPath = (rawPath: string): string => {
  const withoutQuery = rawPath.split("?")[0] ?? "/";
  const decodedPath = decodeURIComponent(withoutQuery);
  const posixPath = decodedPath.replace(/\\/g, "/");
  return path.posix.normalize(
    posixPath.startsWith("/") ? posixPath : `/${posixPath}`,
  );
};

const stripBasePath = (pathname: string, basePath: string): string | null => {
  if (basePath === "/") {
    return pathname;
  }

  if (pathname === basePath) {
    return "/";
  }

  if (!pathname.startsWith(`${basePath}/`)) {
    return null;
  }

  return pathname.slice(basePath.length);
};

const resolveCandidatePaths = (requestPath: string): string[] => {
  const candidates = new Set<string>();
  const normalized = requestPath.length > 0 ? requestPath : "/";

  if (normalized.endsWith("/")) {
    candidates.add(path.posix.join(normalized, "index.html"));
  } else {
    candidates.add(normalized);
    candidates.add(`${normalized}.html`);
    candidates.add(path.posix.join(normalized, "index.html"));
  }

  return Array.from(candidates);
};

const resolveFilePath = (
  siteDirectory: string,
  candidatePath: string,
): string | null => {
  const relativePath = candidatePath.replace(/^\/+/, "");
  const absolutePath = path.resolve(siteDirectory, relativePath);
  const relativeFromSiteRoot = path.relative(siteDirectory, absolutePath);
  if (
    relativeFromSiteRoot.startsWith("..") ||
    path.isAbsolute(relativeFromSiteRoot)
  ) {
    return null;
  }

  return absolutePath;
};

const sendError = (
  response: ServerResponse,
  statusCode: number,
  message: string,
): void => {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify({ error: message }));
};

const handleRequest = (
  request: IncomingMessage,
  response: ServerResponse,
  config: DocsServiceConfig,
): void => {
  const method = request.method ?? "GET";
  if (method !== "GET" && method !== "HEAD") {
    sendError(response, 405, "method_not_allowed");
    return;
  }

  let pathname: string;
  try {
    pathname = normalizeRequestPath(request.url ?? "/");
  } catch {
    sendError(response, 400, "invalid_path");
    return;
  }

  const relativeRequestPath = stripBasePath(pathname, config.basePath);
  if (relativeRequestPath == null) {
    sendError(response, 404, "not_found");
    return;
  }

  for (const candidate of resolveCandidatePaths(relativeRequestPath)) {
    const absolutePath = resolveFilePath(config.siteDirectory, candidate);
    if (
      !absolutePath ||
      !fs.existsSync(absolutePath) ||
      fs.statSync(absolutePath).isDirectory()
    ) {
      continue;
    }

    const ext = path.extname(absolutePath).toLowerCase();
    const contentType = contentTypes.get(ext) ?? "application/octet-stream";

    response.statusCode = 200;
    response.setHeader("Content-Type", contentType);

    if (method === "HEAD") {
      response.end();
      return;
    }

    fs.createReadStream(absolutePath)
      .on("error", () => sendError(response, 500, "file_read_failed"))
      .pipe(response);
    return;
  }

  sendError(response, 404, "not_found");
};

export const startDocsServer = (config: DocsServiceConfig) => {
  if (
    !fs.existsSync(config.siteDirectory) ||
    !fs.statSync(config.siteDirectory).isDirectory()
  ) {
    throw new Error(`Docs site directory is missing: ${config.siteDirectory}`);
  }

  const server = createServer((request, response) => {
    try {
      handleRequest(request, response, config);
    } catch (error) {
      const err = error as Error;
      log("error", "Unhandled docs request failure", {
        error: err.message,
        method: request.method ?? "GET",
        path: request.url ?? "/",
      });
      sendError(response, 500, "internal_error");
    }
  });

  server.on("error", (error) => {
    const err = error as Error;
    log("error", "Docs service failed", { error: err.message });
  });

  server.listen(config.port, config.host, () => {
    log("info", "Docs service started", {
      host: config.host,
      port: config.port,
      basePath: config.basePath,
      siteDirectory: config.siteDirectory,
    });
  });

  return {
    close: (): void => {
      server.close(() => {
        log("info", "Docs service stopped");
      });
    },
  };
};
