import { describe, expect, it } from "vitest";

import { resolveDocsServiceConfig } from "../src/config.js";

describe("resolveDocsServiceConfig", () => {
  it("normalizes base path and keeps valid port", () => {
    const config = resolveDocsServiceConfig({
      OTTO_DOCS_HOST: "127.0.0.1",
      OTTO_DOCS_PORT: "4310",
      OTTO_DOCS_BASE_PATH: "docs/live/",
      OTTO_DOCS_SITE_DIR: "/tmp/otto-docs-site",
    });

    expect(config.host).toBe("127.0.0.1");
    expect(config.port).toBe(4310);
    expect(config.basePath).toBe("/docs/live");
    expect(config.siteDirectory).toBe("/tmp/otto-docs-site");
    expect(config.externalApiBaseUrl).toBe("http://127.0.0.1:4190");
  });

  it("falls back to defaults for invalid port and empty base path", () => {
    const config = resolveDocsServiceConfig({
      OTTO_DOCS_PORT: "99999",
      OTTO_DOCS_BASE_PATH: "",
    });

    expect(config.host).toBe("0.0.0.0");
    expect(config.port).toBe(4174);
    expect(config.basePath).toBe("/");
    expect(config.siteDirectory.length).toBeGreaterThan(0);
    expect(config.externalApiBaseUrl).toBe("http://127.0.0.1:4190");
  });

  it("prefers explicit external API base url", () => {
    const config = resolveDocsServiceConfig({
      OTTO_EXTERNAL_API_URL: "http://otto-api.local:4300/",
    });

    expect(config.externalApiBaseUrl).toBe("http://otto-api.local:4300");
  });
});
