import path from "node:path";
import { access, readFile, readdir } from "node:fs/promises";
import { constants } from "node:fs";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import { parseJsonc } from "./jsonc.js";

const SEMVER_REGEX =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-.]+)?(?:\+[0-9A-Za-z-.]+)?$/;
const EXTENSION_ID_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const extensionManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().regex(EXTENSION_ID_REGEX),
    name: z.string().trim().min(1),
    version: z.string().regex(SEMVER_REGEX),
    description: z.string().trim().min(1),
    tags: z.array(z.string().trim().min(1)).optional().default([]),
    compatibility: z
      .object({
        otto: z.string().trim().min(1),
        node: z.string().trim().min(1).optional(),
      })
      .optional(),
    payload: z
      .object({
        tools: z
          .object({
            path: z.string().trim().min(1),
            packageJson: z.string().trim().min(1).optional(),
          })
          .optional(),
        skills: z
          .object({
            path: z.string().trim().min(1),
          })
          .optional(),
        mcp: z
          .object({
            inline: z.record(z.string(), z.unknown()).optional(),
            file: z.string().trim().min(1).optional(),
          })
          .optional(),
        overlays: z
          .object({
            opencode: z.string().trim().min(1).optional(),
            taskConfig: z.string().trim().min(1).optional(),
          })
          .optional(),
      })
      .superRefine((payload, context) => {
        if (
          !payload.tools &&
          !payload.skills &&
          !payload.mcp &&
          !payload.overlays
        ) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "At least one payload section must be declared",
            path: ["payload"],
          });
        }

        if (payload.mcp && !payload.mcp.inline && !payload.mcp.file) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "MCP payload requires either inline config or file",
            path: ["payload", "mcp"],
          });
        }
      }),
    requirements: z
      .object({
        env: z.array(z.string().trim().min(1)).optional().default([]),
        files: z.array(z.string().trim().min(1)).optional().default([]),
        binaries: z.array(z.string().trim().min(1)).optional().default([]),
      })
      .optional(),
    policy: z
      .object({
        recommendedScopes: z
          .array(z.enum(["interactive", "scheduled-profile-only"]))
          .optional()
          .default([]),
        scheduledDefault: z.enum(["deny"]).optional(),
      })
      .optional(),
    dependencies: z
      .array(
        z.object({
          id: z.string().regex(EXTENSION_ID_REGEX),
          version: z.string().trim().min(1),
        }),
      )
      .optional()
      .default([]),
  })
  .strict();

export type ExtensionManifest = z.infer<typeof extensionManifestSchema>;

export type ExtensionValidationIssue = {
  severity: "error" | "warning";
  code: string;
  extension: {
    id: string | null;
    version: string | null;
  };
  path: string;
  field: string | null;
  message: string;
  hint: string | null;
};

export type ExtensionCatalogEntry = {
  id: string;
  name: string;
  version: string;
  description: string;
  tags: string[];
  directory: string;
  manifestPath: string;
  payloadTypes: string[];
};

export type ExtensionCatalogValidationResult = {
  ok: boolean;
  summary: {
    extensionsScanned: number;
    errors: number;
    warnings: number;
  };
  entries: ExtensionCatalogEntry[];
  issues: ExtensionValidationIssue[];
};

type ParsedManifest = {
  directoryName: string;
  directoryPath: string;
  manifestPath: string;
  manifest: ExtensionManifest | null;
};

const toFieldPath = (pathParts: PropertyKey[]): string | null => {
  if (pathParts.length === 0) {
    return null;
  }

  return pathParts
    .map((part) => {
      return typeof part === "number" ? `[${part}]` : String(part);
    })
    .join(".")
    .replace(/\.\[/g, "[");
};

const createIssue = (
  input: ExtensionValidationIssue,
): ExtensionValidationIssue => input;

const pathExists = async (targetPath: string): Promise<boolean> => {
  try {
    await access(targetPath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
};

export const resolveDefaultExtensionCatalogRoot = (): string => {
  const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(currentDirectory, "../../otto-extensions/extensions");
};

const parseManifest = async (
  directoryName: string,
  directoryPath: string,
): Promise<{ parsed: ParsedManifest; issues: ExtensionValidationIssue[] }> => {
  const manifestPath = path.join(directoryPath, "manifest.jsonc");
  const issues: ExtensionValidationIssue[] = [];

  if (!(await pathExists(manifestPath))) {
    return {
      parsed: {
        directoryName,
        directoryPath,
        manifestPath,
        manifest: null,
      },
      issues: [
        createIssue({
          severity: "error",
          code: "manifest.missing",
          extension: { id: directoryName, version: null },
          path: manifestPath,
          field: null,
          message: "Manifest file is missing",
          hint: "Create manifest.jsonc in the extension directory",
        }),
      ],
    };
  }

  let source: string;
  try {
    source = await readFile(manifestPath, "utf8");
  } catch (error) {
    const err = error as Error;
    return {
      parsed: {
        directoryName,
        directoryPath,
        manifestPath,
        manifest: null,
      },
      issues: [
        createIssue({
          severity: "error",
          code: "manifest.read_error",
          extension: { id: directoryName, version: null },
          path: manifestPath,
          field: null,
          message: err.message,
          hint: "Verify the manifest file is readable",
        }),
      ],
    };
  }

  let parsed: unknown;
  try {
    parsed = parseJsonc(source);
  } catch {
    return {
      parsed: {
        directoryName,
        directoryPath,
        manifestPath,
        manifest: null,
      },
      issues: [
        createIssue({
          severity: "error",
          code: "manifest.parse_error",
          extension: { id: directoryName, version: null },
          path: manifestPath,
          field: null,
          message: "Manifest is not valid JSONC",
          hint: "Fix JSON syntax, comments, or trailing commas",
        }),
      ],
    };
  }

  const validated = extensionManifestSchema.safeParse(parsed);
  if (!validated.success) {
    for (const zodIssue of validated.error.issues) {
      issues.push(
        createIssue({
          severity: "error",
          code: "manifest.schema_error",
          extension: { id: directoryName, version: null },
          path: manifestPath,
          field: toFieldPath(zodIssue.path),
          message: zodIssue.message,
          hint: "Update manifest.jsonc to satisfy the extension contract",
        }),
      );
    }

    return {
      parsed: {
        directoryName,
        directoryPath,
        manifestPath,
        manifest: null,
      },
      issues,
    };
  }

  return {
    parsed: {
      directoryName,
      directoryPath,
      manifestPath,
      manifest: validated.data,
    },
    issues,
  };
};

const addMissingPathIssueIfNeeded = async (
  issues: ExtensionValidationIssue[],
  parsed: ParsedManifest,
  field: string,
  relativePath: string,
  hint: string,
): Promise<void> => {
  const targetPath = path.join(parsed.directoryPath, relativePath);

  if (await pathExists(targetPath)) {
    return;
  }

  issues.push(
    createIssue({
      severity: "error",
      code: "payload.path_missing",
      extension: {
        id: parsed.manifest?.id ?? parsed.directoryName,
        version: parsed.manifest?.version ?? null,
      },
      path: parsed.manifestPath,
      field,
      message: `Referenced path does not exist: ${relativePath}`,
      hint,
    }),
  );
};

const derivePayloadTypes = (manifest: ExtensionManifest): string[] => {
  const result: string[] = [];

  if (manifest.payload.tools) {
    result.push("tools");
  }
  if (manifest.payload.skills) {
    result.push("skills");
  }
  if (manifest.payload.mcp) {
    result.push("mcp");
  }
  if (manifest.payload.overlays) {
    result.push("overlays");
  }

  return result;
};

export const validateExtensionCatalog = async (
  catalogRoot = resolveDefaultExtensionCatalogRoot(),
  onlyExtensionId?: string,
): Promise<ExtensionCatalogValidationResult> => {
  const issues: ExtensionValidationIssue[] = [];
  const entries: ExtensionCatalogEntry[] = [];
  const manifests: ParsedManifest[] = [];

  const discovered = await readdir(catalogRoot, { withFileTypes: true });
  const extensionDirectories = discovered
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .filter((name) => (onlyExtensionId ? name === onlyExtensionId : true))
    .sort((left, right) => left.localeCompare(right));

  if (onlyExtensionId && extensionDirectories.length === 0) {
    issues.push(
      createIssue({
        severity: "error",
        code: "catalog.extension_not_found",
        extension: { id: onlyExtensionId, version: null },
        path: catalogRoot,
        field: null,
        message: `Extension '${onlyExtensionId}' is not present in catalog`,
        hint: "Check extension id spelling or remove --id filter",
      }),
    );
  }

  for (const directoryName of extensionDirectories) {
    const directoryPath = path.join(catalogRoot, directoryName);
    const { parsed, issues: manifestIssues } = await parseManifest(
      directoryName,
      directoryPath,
    );
    issues.push(...manifestIssues);
    manifests.push(parsed);

    if (!parsed.manifest) {
      continue;
    }

    if (parsed.manifest.id !== directoryName) {
      issues.push(
        createIssue({
          severity: "error",
          code: "manifest.id_mismatch",
          extension: {
            id: parsed.manifest.id,
            version: parsed.manifest.version,
          },
          path: parsed.manifestPath,
          field: "id",
          message: `Manifest id '${parsed.manifest.id}' must match directory name '${directoryName}'`,
          hint: "Rename the extension directory or update manifest id",
        }),
      );
    }

    if (parsed.manifest.payload.tools) {
      await addMissingPathIssueIfNeeded(
        issues,
        parsed,
        "payload.tools.path",
        parsed.manifest.payload.tools.path,
        "Create the tools directory or update payload.tools.path",
      );

      if (parsed.manifest.payload.tools.packageJson) {
        await addMissingPathIssueIfNeeded(
          issues,
          parsed,
          "payload.tools.packageJson",
          parsed.manifest.payload.tools.packageJson,
          "Create the tools package.json file or update payload.tools.packageJson",
        );
      }
    }

    if (parsed.manifest.payload.skills) {
      await addMissingPathIssueIfNeeded(
        issues,
        parsed,
        "payload.skills.path",
        parsed.manifest.payload.skills.path,
        "Create the skills directory or update payload.skills.path",
      );
    }

    if (parsed.manifest.payload.mcp?.file) {
      await addMissingPathIssueIfNeeded(
        issues,
        parsed,
        "payload.mcp.file",
        parsed.manifest.payload.mcp.file,
        "Create the MCP file or update payload.mcp.file",
      );
    }

    if (parsed.manifest.payload.overlays?.opencode) {
      await addMissingPathIssueIfNeeded(
        issues,
        parsed,
        "payload.overlays.opencode",
        parsed.manifest.payload.overlays.opencode,
        "Create the OpenCode overlay file or update payload.overlays.opencode",
      );
    }

    if (parsed.manifest.payload.overlays?.taskConfig) {
      await addMissingPathIssueIfNeeded(
        issues,
        parsed,
        "payload.overlays.taskConfig",
        parsed.manifest.payload.overlays.taskConfig,
        "Create the task config overlay file or update payload.overlays.taskConfig",
      );
    }

    entries.push({
      id: parsed.manifest.id,
      name: parsed.manifest.name,
      version: parsed.manifest.version,
      description: parsed.manifest.description,
      tags: parsed.manifest.tags,
      directory: directoryPath,
      manifestPath: parsed.manifestPath,
      payloadTypes: derivePayloadTypes(parsed.manifest),
    });
  }

  const manifestEntries = manifests.filter((entry) =>
    Boolean(entry.manifest),
  ) as Array<ParsedManifest & { manifest: ExtensionManifest }>;

  const seenVersions = new Map<string, string>();
  const knownIds = new Set(manifestEntries.map((entry) => entry.manifest.id));

  for (const entry of manifestEntries) {
    const key = `${entry.manifest.id}@${entry.manifest.version}`;
    const previousPath = seenVersions.get(key);
    if (previousPath) {
      issues.push(
        createIssue({
          severity: "error",
          code: "catalog.duplicate_id_version",
          extension: { id: entry.manifest.id, version: entry.manifest.version },
          path: entry.manifestPath,
          field: null,
          message: `Duplicate extension version '${key}' found in catalog`,
          hint: `Remove duplicate or bump version (previous at ${previousPath})`,
        }),
      );
    } else {
      seenVersions.set(key, entry.manifestPath);
    }

    for (const dependency of entry.manifest.dependencies) {
      if (knownIds.has(dependency.id)) {
        continue;
      }

      issues.push(
        createIssue({
          severity: "error",
          code: "dependency.unknown_extension",
          extension: { id: entry.manifest.id, version: entry.manifest.version },
          path: entry.manifestPath,
          field: "dependencies",
          message: `Dependency '${dependency.id}' is not present in catalog`,
          hint: "Add the dependency extension to catalog or remove the dependency declaration",
        }),
      );
    }
  }

  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.filter(
    (issue) => issue.severity === "warning",
  ).length;

  return {
    ok: errors === 0,
    summary: {
      extensionsScanned: extensionDirectories.length,
      errors,
      warnings,
    },
    entries: entries.sort((left, right) => left.id.localeCompare(right.id)),
    issues,
  };
};

export const formatValidationReport = (
  result: ExtensionCatalogValidationResult,
  catalogRoot: string,
  onlyExtensionId?: string,
): string => {
  const lines: string[] = [];

  lines.push(`Extension catalog root: ${catalogRoot}`);
  if (onlyExtensionId) {
    lines.push(`Filter: ${onlyExtensionId}`);
  }
  lines.push(`Extensions scanned: ${result.summary.extensionsScanned}`);
  lines.push(`Errors: ${result.summary.errors}`);
  lines.push(`Warnings: ${result.summary.warnings}`);
  lines.push(`Status: ${result.ok ? "PASS" : "FAIL"}`);

  if (result.entries.length > 0) {
    lines.push("");
    lines.push("Catalog entries:");
    for (const entry of result.entries) {
      lines.push(
        `- ${entry.id}@${entry.version} (${entry.payloadTypes.join(", ") || "no-payload"}) - ${entry.description}`,
      );
    }
  }

  if (result.issues.length > 0) {
    lines.push("");
    lines.push("Issues:");
    for (const issue of result.issues) {
      const extensionRef = issue.extension.id
        ? `${issue.extension.id}${issue.extension.version ? `@${issue.extension.version}` : ""}`
        : "<unknown-extension>";
      lines.push(
        `- [${issue.severity.toUpperCase()}] ${issue.code} :: ${extensionRef}`,
      );
      lines.push(`  path: ${issue.path}`);
      if (issue.field) {
        lines.push(`  field: ${issue.field}`);
      }
      lines.push(`  message: ${issue.message}`);
      if (issue.hint) {
        lines.push(`  hint: ${issue.hint}`);
      }
    }
  }

  return `${lines.join("\n")}\n`;
};
