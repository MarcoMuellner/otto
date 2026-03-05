import path from "node:path";
import { fileURLToPath } from "node:url";

export type DocsServiceConfig = {
  host: string;
  port: number;
  basePath: string;
  siteDirectory: string;
};

const DEFAULT_HOST = "0.0.0.0";
const DEFAULT_PORT = 4174;
const DEFAULT_BASE_PATH = "/";

const normalizeBasePath = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed === "/") {
    return "/";
  }

  let normalized = trimmed;
  if (!normalized.startsWith("/")) {
    normalized = `/${normalized}`;
  }

  normalized = normalized.replace(/\/{2,}/g, "/");
  if (normalized.length > 1) {
    normalized = normalized.replace(/\/+$/g, "");
  }

  return normalized.length > 0 ? normalized : "/";
};

const resolvePort = (rawPort: string | undefined): number => {
  if (!rawPort) {
    return DEFAULT_PORT;
  }

  const value = Number.parseInt(rawPort.trim(), 10);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    return DEFAULT_PORT;
  }

  return value;
};

const defaultSiteDirectory = (): string => {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFile);
  return path.resolve(currentDir, "..", "..", "docs-site");
};

export const resolveDocsServiceConfig = (
  env: NodeJS.ProcessEnv = process.env,
): DocsServiceConfig => {
  const host = env.OTTO_DOCS_HOST?.trim() || DEFAULT_HOST;
  const port = resolvePort(env.OTTO_DOCS_PORT);
  const basePath = normalizeBasePath(
    env.OTTO_DOCS_BASE_PATH ?? DEFAULT_BASE_PATH,
  );
  const siteDirectory =
    env.OTTO_DOCS_SITE_DIR?.trim() || defaultSiteDirectory();

  return {
    host,
    port,
    basePath,
    siteDirectory,
  };
};
