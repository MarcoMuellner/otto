import fs from "node:fs";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import path from "node:path";

import type { DocsServiceConfig } from "./config.js";

type DocsSectionReference = {
  anchor: string;
  title: string;
};

type DocsPageRecord = {
  version: string;
  slug: string;
  url: string;
  title: string;
  snippet: string;
  sections: DocsSectionReference[];
  searchText: string;
};

type DocsIndexCache = {
  siteDirectory: string;
  fileCount: number;
  latestMtimeMs: number;
  pages: DocsPageRecord[];
};

let docsIndexCache: DocsIndexCache | null = null;

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

const sendDocsError = (
  response: ServerResponse,
  input: {
    statusCode: number;
    error:
      | "auth_required"
      | "invalid_request"
      | "not_found"
      | "version_mismatch"
      | "upstream_unreachable";
    message: string;
    details?: Record<string, unknown>;
  },
): void => {
  response.statusCode = input.statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(
    JSON.stringify({
      error: input.error,
      message: input.message,
      ...(input.details ? { details: input.details } : {}),
    }),
  );
};

const decodeHtmlEntities = (value: string): string => {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
};

const stripHtml = (value: string): string => {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
};

const normalizeSlug = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "/") {
    return "/";
  }

  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const normalized = path.posix.normalize(withLeadingSlash);
  if (normalized === "/") {
    return "/";
  }

  return normalized.replace(/\/+$/g, "");
};

const toCanonicalUrl = (version: string, slug: string): string => {
  if (slug === "/") {
    return version === "current" ? "/" : `/${version}/`;
  }

  const withTrailingSlash = `${slug.replace(/\/+$/g, "")}/`;
  return version === "current"
    ? withTrailingSlash
    : `/${version}${withTrailingSlash}`;
};

const looksLikeVersionSegment = (value: string): boolean => {
  return /^v\d[\w.-]*$/i.test(value);
};

const resolveVersionAndSlugFromUrlPath = (
  urlPath: string,
): { version: string; slug: string } => {
  const normalizedPath = urlPath.replace(/\\/g, "/");
  let routePath = normalizedPath;
  if (routePath.endsWith("index.html")) {
    routePath = routePath.slice(0, -"index.html".length);
  } else if (routePath.endsWith(".html")) {
    routePath = routePath.slice(0, -".html".length);
  }

  routePath = normalizeSlug(routePath);
  const segments = routePath.split("/").filter((segment) => segment.length > 0);
  if (segments.length === 0) {
    return {
      version: "current",
      slug: "/",
    };
  }

  if (looksLikeVersionSegment(segments[0])) {
    return {
      version: segments[0],
      slug: normalizeSlug(`/${segments.slice(1).join("/")}`),
    };
  }

  return {
    version: "current",
    slug: routePath,
  };
};

const listHtmlFiles = (siteDirectory: string): string[] => {
  const files: string[] = [];
  const stack = [siteDirectory];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolutePath);
        continue;
      }

      if (entry.isFile() && absolutePath.toLowerCase().endsWith(".html")) {
        files.push(absolutePath);
      }
    }
  }

  return files;
};

const extractTitle = (html: string): string => {
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (titleMatch?.[1]) {
    const cleaned = stripHtml(titleMatch[1]);
    if (cleaned.length > 0) {
      return cleaned;
    }
  }

  const h1Match = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  if (h1Match?.[1]) {
    const cleaned = stripHtml(h1Match[1]);
    if (cleaned.length > 0) {
      return cleaned;
    }
  }

  return "Untitled";
};

const extractSnippet = (html: string): string => {
  const descriptionMatch =
    /<meta[^>]+name=["']description["'][^>]+content=["']([\s\S]*?)["'][^>]*>/i.exec(
      html,
    );
  if (descriptionMatch?.[1]) {
    const cleaned = stripHtml(descriptionMatch[1]);
    if (cleaned.length > 0) {
      return cleaned;
    }
  }

  const paragraphMatch = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(html);
  const paragraphText = paragraphMatch?.[1] ? stripHtml(paragraphMatch[1]) : "";
  if (paragraphText.length > 0) {
    return paragraphText.slice(0, 280);
  }

  return "";
};

const extractSections = (html: string): DocsSectionReference[] => {
  const headingRegex = /<h([1-6])([^>]*)>([\s\S]*?)<\/h\1>/gi;
  const sections: DocsSectionReference[] = [];

  for (const match of html.matchAll(headingRegex)) {
    const attrs = match[2] ?? "";
    const idMatch = /\sid=["']([^"']+)["']/i.exec(attrs);
    if (!idMatch?.[1]) {
      continue;
    }

    const title = stripHtml(match[3] ?? "");
    if (!title) {
      continue;
    }

    sections.push({
      anchor: idMatch[1],
      title,
    });
  }

  return sections;
};

const buildDocsIndex = (
  siteDirectory: string,
  htmlFiles: string[] = listHtmlFiles(siteDirectory),
): DocsPageRecord[] => {
  const pages: DocsPageRecord[] = [];

  for (const filePath of htmlFiles) {
    const relativePath = path
      .relative(siteDirectory, filePath)
      .replace(/\\/g, "/");
    const urlPath = normalizeSlug(`/${relativePath}`);
    const html = fs.readFileSync(filePath, "utf8");
    const { version, slug } = resolveVersionAndSlugFromUrlPath(urlPath);
    const title = extractTitle(html);
    const snippet = extractSnippet(html);
    const sections = extractSections(html);
    const searchText =
      `${title}\n${snippet}\n${sections.map((entry) => entry.title).join("\n")}`
        .toLowerCase()
        .trim();

    pages.push({
      version,
      slug,
      url: toCanonicalUrl(version, slug),
      title,
      snippet,
      sections,
      searchText,
    });
  }

  return pages;
};

const resolveDocsIndex = (siteDirectory: string): DocsPageRecord[] => {
  const htmlFiles = listHtmlFiles(siteDirectory);
  let latestMtimeMs = 0;
  for (const filePath of htmlFiles) {
    const mtimeMs = fs.statSync(filePath).mtimeMs;
    if (mtimeMs > latestMtimeMs) {
      latestMtimeMs = mtimeMs;
    }
  }

  if (
    docsIndexCache &&
    docsIndexCache.siteDirectory === siteDirectory &&
    docsIndexCache.fileCount === htmlFiles.length &&
    docsIndexCache.latestMtimeMs === latestMtimeMs
  ) {
    return docsIndexCache.pages;
  }

  const pages = buildDocsIndex(siteDirectory, htmlFiles);
  docsIndexCache = {
    siteDirectory,
    fileCount: htmlFiles.length,
    latestMtimeMs,
    pages,
  };

  return pages;
};

const toPositiveInt = (
  raw: string | null,
  fallback: number,
  max: number,
): number | null => {
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
    return null;
  }

  return parsed;
};

const handleDocsSearch = (
  response: ServerResponse,
  config: DocsServiceConfig,
  searchParams: URLSearchParams,
): void => {
  const rawQuery = searchParams.get("q")?.trim() ?? "";
  if (!rawQuery) {
    sendDocsError(response, {
      statusCode: 400,
      error: "invalid_request",
      message: "Missing required query parameter: q",
    });
    return;
  }

  const limit = toPositiveInt(searchParams.get("limit"), 8, 50);
  if (limit == null) {
    sendDocsError(response, {
      statusCode: 400,
      error: "invalid_request",
      message: "Invalid limit. Use an integer between 1 and 50.",
    });
    return;
  }

  const requestedVersion = searchParams.get("version")?.trim();
  const pages = resolveDocsIndex(config.siteDirectory);
  if (requestedVersion) {
    const hasVersion = pages.some((page) => page.version === requestedVersion);
    if (!hasVersion) {
      const availableVersions = Array.from(
        new Set(pages.map((page) => page.version)),
      ).sort();
      sendDocsError(response, {
        statusCode: 409,
        error: "version_mismatch",
        message: `Requested docs version '${requestedVersion}' is not available.`,
        details: { availableVersions },
      });
      return;
    }
  }

  const normalizedQuery = rawQuery.toLowerCase();
  const terms = normalizedQuery.split(/\s+/).filter((term) => term.length > 0);
  const candidates = pages.filter((page) =>
    requestedVersion ? page.version === requestedVersion : true,
  );
  const scored = candidates
    .map((page) => {
      const title = page.title.toLowerCase();
      const exactTitle = title.includes(normalizedQuery) ? 3 : 0;
      const exactBody = page.searchText.includes(normalizedQuery) ? 2 : 0;
      const termMatches = terms.reduce((count, term) => {
        return count + (page.searchText.includes(term) ? 1 : 0);
      }, 0);
      return {
        page,
        score: exactTitle + exactBody + termMatches,
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return left.page.slug.localeCompare(right.page.slug);
    })
    .slice(0, limit);

  response.statusCode = 200;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(
    JSON.stringify({
      query: rawQuery,
      version: requestedVersion ?? null,
      results: scored.map(({ page }) => ({
        version: page.version,
        slug: page.slug,
        url: page.url,
        title: page.title,
        snippet: page.snippet,
        sections: page.sections,
      })),
    }),
  );
};

const handleDocsOpen = (
  response: ServerResponse,
  config: DocsServiceConfig,
  searchParams: URLSearchParams,
): void => {
  const rawSlug = searchParams.get("slug")?.trim() ?? "";
  if (!rawSlug) {
    sendDocsError(response, {
      statusCode: 400,
      error: "invalid_request",
      message: "Missing required query parameter: slug",
    });
    return;
  }

  const slug = normalizeSlug(rawSlug);
  const requestedVersion = searchParams.get("version")?.trim();
  const rawSection = searchParams.get("section")?.trim();
  const requestedSection = rawSection
    ? rawSection.replace(/^#/, "")
    : undefined;
  const pages = resolveDocsIndex(config.siteDirectory);
  const withSlug = pages.filter((page) => page.slug === slug);

  if (withSlug.length === 0) {
    sendDocsError(response, {
      statusCode: 404,
      error: "not_found",
      message: `No docs page found for slug '${slug}'.`,
    });
    return;
  }

  const selected = requestedVersion
    ? withSlug.find((page) => page.version === requestedVersion)
    : (withSlug.find((page) => page.version === "current") ?? withSlug[0]);

  if (!selected) {
    const availableVersions = Array.from(
      new Set(withSlug.map((page) => page.version)),
    ).sort();
    sendDocsError(response, {
      statusCode: 409,
      error: "version_mismatch",
      message: `Requested docs version '${requestedVersion}' is not available for slug '${slug}'.`,
      details: { availableVersions },
    });
    return;
  }

  const selectedSection = requestedSection
    ? selected.sections.find((entry) => entry.anchor === requestedSection)
    : null;
  if (requestedSection && !selectedSection) {
    sendDocsError(response, {
      statusCode: 404,
      error: "not_found",
      message: `Section '${requestedSection}' was not found for '${slug}'.`,
      details: {
        availableSections: selected.sections.map((entry) => entry.anchor),
      },
    });
    return;
  }

  const sectionUrl = selectedSection
    ? `${selected.url}#${selectedSection.anchor}`
    : selected.url;

  response.statusCode = 200;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(
    JSON.stringify({
      page: {
        version: selected.version,
        slug: selected.slug,
        url: selected.url,
        title: selected.title,
        snippet: selected.snippet,
      },
      section: selectedSection
        ? {
            anchor: selectedSection.anchor,
            title: selectedSection.title,
            url: sectionUrl,
          }
        : null,
      sections: selected.sections,
    }),
  );
};

const handleHealth = (
  response: ServerResponse,
  config: DocsServiceConfig,
): void => {
  const pages = resolveDocsIndex(config.siteDirectory);
  const versions = Array.from(
    new Set(pages.map((page) => page.version)),
  ).sort();

  response.statusCode = 200;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(
    JSON.stringify({
      status: "ok",
      service: "docs-service",
      pageCount: pages.length,
      versions,
      liveProxyPath: "/api/live/self-awareness",
    }),
  );
};

const readBearerToken = (request: IncomingMessage): string | null => {
  const authorization = request.headers.authorization;
  if (!authorization) {
    return null;
  }

  const [scheme, token] = authorization.split(" ");
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") {
    return null;
  }

  const normalizedToken = token.trim();
  return normalizedToken.length > 0 ? normalizedToken : null;
};

const forwardLiveSelfAwareness = async (
  request: IncomingMessage,
  response: ServerResponse,
  config: DocsServiceConfig,
): Promise<void> => {
  const token = readBearerToken(request);
  if (!token) {
    sendDocsError(response, {
      statusCode: 401,
      error: "auth_required",
      message: "Missing bearer token. Provide OTTO_EXTERNAL_API_TOKEN.",
    });
    return;
  }

  const endpoint = `${config.externalApiBaseUrl}/external/self-awareness/live`;

  try {
    const upstreamResponse = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const contentType = upstreamResponse.headers.get("content-type");
    response.statusCode = upstreamResponse.status;
    response.setHeader(
      "Content-Type",
      contentType ?? "application/json; charset=utf-8",
    );

    const body = await upstreamResponse.text();
    response.end(body);
  } catch {
    sendDocsError(response, {
      statusCode: 502,
      error: "upstream_unreachable",
      message: "Failed to reach Otto external API live endpoint.",
    });
  }
};

const handleRequest = (
  request: IncomingMessage,
  response: ServerResponse,
  config: DocsServiceConfig,
): Promise<void> | void => {
  const method = request.method ?? "GET";
  if (method !== "GET" && method !== "HEAD") {
    sendError(response, 405, "method_not_allowed");
    return;
  }

  let pathname: string;
  let requestUrl: URL;
  try {
    requestUrl = new URL(request.url ?? "/", "http://localhost");
    pathname = normalizeRequestPath(requestUrl.pathname);
  } catch {
    sendError(response, 400, "invalid_path");
    return;
  }

  const relativeRequestPath = stripBasePath(pathname, config.basePath);
  if (relativeRequestPath == null) {
    sendError(response, 404, "not_found");
    return;
  }

  if (relativeRequestPath === "/api/live/self-awareness") {
    return forwardLiveSelfAwareness(request, response, config);
  }

  if (relativeRequestPath === "/api/health") {
    if (method === "HEAD") {
      response.statusCode = 200;
      response.end();
      return;
    }

    if (method !== "GET") {
      sendError(response, 405, "method_not_allowed");
      return;
    }

    return handleHealth(response, config);
  }

  if (relativeRequestPath === "/api/docs/search") {
    if (method !== "GET") {
      sendError(response, 405, "method_not_allowed");
      return;
    }

    return handleDocsSearch(response, config, requestUrl.searchParams);
  }

  if (relativeRequestPath === "/api/docs/open") {
    if (method !== "GET") {
      sendError(response, 405, "method_not_allowed");
      return;
    }

    return handleDocsOpen(response, config, requestUrl.searchParams);
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

  const server = createServer(async (request, response) => {
    try {
      await handleRequest(request, response, config);
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

  let listeningPort = config.port;
  let isClosing = false;
  let closePromise: Promise<void> | null = null;

  server.listen(config.port, config.host, () => {
    const address = server.address();
    const resolvedPort =
      address && typeof address !== "string" ? address.port : config.port;
    listeningPort = resolvedPort;

    log("info", "Docs service started", {
      host: config.host,
      port: resolvedPort,
      basePath: config.basePath,
      siteDirectory: config.siteDirectory,
    });
  });

  return {
    get port(): number {
      return listeningPort;
    },
    close: async (): Promise<void> => {
      if (isClosing && closePromise) {
        await closePromise;
        return;
      }

      if (!server.listening) {
        return;
      }

      isClosing = true;
      closePromise = new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            isClosing = false;
            closePromise = null;
            reject(error);
            return;
          }

          log("info", "Docs service stopped");
          resolve();
        });
      });

      await closePromise;
    },
  };
};
