import path from "node:path";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { validateExtensionCatalog } from "../../src/catalog.js";
import { runExtensionCatalogValidationCommand } from "../../src/validate-command.js";

const fixturesRoot = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
);

describe("extension catalog validation", () => {
  it("passes for the bundled extension catalog", async () => {
    // Act
    const result = await validateExtensionCatalog();

    // Assert
    expect(result.ok).toBe(true);
    expect(result.summary.errors).toBe(0);
    expect(result.entries.length).toBe(result.summary.extensionsScanned);
  });

  it("reports duplicate extension id/version collisions", async () => {
    // Arrange
    const catalogRoot = path.join(
      fixturesRoot,
      "duplicate-catalog",
      "extensions",
    );

    // Act
    const result = await validateExtensionCatalog(catalogRoot);

    // Assert
    expect(result.ok).toBe(false);
    expect(
      result.issues.some(
        (issue) => issue.code === "catalog.duplicate_id_version",
      ),
    ).toBe(true);
  });

  it("reports missing payload paths with actionable diagnostics", async () => {
    // Arrange
    const catalogRoot = path.join(
      fixturesRoot,
      "missing-path-catalog",
      "extensions",
    );

    // Act
    const result = await validateExtensionCatalog(catalogRoot);

    // Assert
    const issue = result.issues.find(
      (entry) => entry.code === "payload.path_missing",
    );
    expect(issue).toBeDefined();
    expect(issue?.field).toBe("payload.skills.path");
    expect(issue?.hint).toContain("Create the skills directory");
  });

  it("reports manifest parse errors for invalid JSONC", async () => {
    // Arrange
    const catalogRoot = path.join(
      fixturesRoot,
      "invalid-jsonc-catalog",
      "extensions",
    );

    // Act
    const result = await validateExtensionCatalog(catalogRoot);

    // Assert
    expect(result.ok).toBe(false);
    expect(
      result.issues.some((issue) => issue.code === "manifest.parse_error"),
    ).toBe(true);
  });

  it("reports missing hook script paths", async () => {
    // Arrange
    const tempRoot = await mkdtemp(
      path.join(tmpdir(), "otto-sdk-hook-catalog-"),
    );
    try {
      const catalogRoot = path.join(tempRoot, "extensions");
      const extensionRoot = path.join(catalogRoot, "hook-test");
      await mkdir(extensionRoot, { recursive: true });
      await writeFile(
        path.join(extensionRoot, "manifest.jsonc"),
        `${JSON.stringify(
          {
            schemaVersion: 1,
            id: "hook-test",
            name: "Hook Test",
            version: "0.1.0",
            description: "hook test extension",
            payload: {
              hooks: {
                install: {
                  all: "scripts/install.sh",
                },
              },
            },
          },
          null,
          2,
        )}\n`,
        "utf8",
      );

      // Act
      const result = await validateExtensionCatalog(catalogRoot);

      // Assert
      expect(result.ok).toBe(false);
      expect(
        result.issues.some(
          (issue) =>
            issue.code === "payload.path_missing" &&
            issue.field === "payload.hooks.install.all",
        ),
      ).toBe(true);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("reports invalid hook paths that are absolute", async () => {
    // Arrange
    const tempRoot = await mkdtemp(
      path.join(tmpdir(), "otto-sdk-hook-catalog-"),
    );
    try {
      const catalogRoot = path.join(tempRoot, "extensions");
      const extensionRoot = path.join(catalogRoot, "hook-test");
      await mkdir(extensionRoot, { recursive: true });
      await writeFile(
        path.join(extensionRoot, "manifest.jsonc"),
        `${JSON.stringify(
          {
            schemaVersion: 1,
            id: "hook-test",
            name: "Hook Test",
            version: "0.1.0",
            description: "hook test extension",
            payload: {
              hooks: {
                install: {
                  all: "/tmp/install.sh",
                },
              },
            },
          },
          null,
          2,
        )}\n`,
        "utf8",
      );

      // Act
      const result = await validateExtensionCatalog(catalogRoot);

      // Assert
      expect(result.ok).toBe(false);
      expect(
        result.issues.some(
          (issue) =>
            issue.code === "payload.path_invalid" &&
            issue.field === "payload.hooks.install.all",
        ),
      ).toBe(true);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});

describe("extension catalog validate command", () => {
  it("emits JSON output and returns failing code when issues exist", async () => {
    // Arrange
    const catalogRoot = path.join(
      fixturesRoot,
      "missing-path-catalog",
      "extensions",
    );
    const stdout: string[] = [];
    const stderr: string[] = [];

    // Act
    const exitCode = await runExtensionCatalogValidationCommand(
      ["--catalog", catalogRoot, "--json"],
      {
        log: (line: string) => stdout.push(line),
      },
      {
        error: (line: string) => stderr.push(line),
      },
    );

    // Assert
    expect(exitCode).toBe(1);
    expect(stderr).toEqual([]);
    expect(stdout[0]).toBeDefined();
    const parsed = JSON.parse(stdout[0] ?? "{}") as {
      ok: boolean;
      issues: Array<{ code: string }>;
    };
    expect(parsed.ok).toBe(false);
    expect(
      parsed.issues.some((issue) => issue.code === "payload.path_missing"),
    ).toBe(true);
  });

  it("returns usage error code for unknown options", async () => {
    // Arrange
    const stdout: string[] = [];
    const stderr: string[] = [];

    // Act
    const exitCode = await runExtensionCatalogValidationCommand(
      ["--unknown"],
      {
        log: (line: string) => stdout.push(line),
      },
      {
        error: (line: string) => stderr.push(line),
      },
    );

    // Assert
    expect(exitCode).toBe(2);
    expect(stdout).toEqual([]);
    expect(stderr[0]).toContain("Unknown argument");
  });
});
