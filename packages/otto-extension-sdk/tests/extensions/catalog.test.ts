import path from "node:path";
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
