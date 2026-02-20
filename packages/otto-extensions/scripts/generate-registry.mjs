import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parse as parseJsonc } from "jsonc-parser";
import semver from "semver";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDirectory, "..");
const extensionsRoot = path.join(packageRoot, "extensions");
const registryRoot = path.join(packageRoot, "registry");
const artifactsRoot = path.join(registryRoot, "artifacts");
const indexPath = path.join(registryRoot, "index.json");

const defaultBaseUrl =
  "https://raw.githubusercontent.com/MarcoMuellner/otto/main/packages/otto-extensions/registry/artifacts";
const artifactBaseUrl =
  process.env.OTTO_EXTENSION_REGISTRY_ARTIFACT_BASE_URL ?? defaultBaseUrl;

const toPayloadTypes = (manifest) => {
  const payload = manifest.payload ?? {};
  return ["tools", "skills", "mcp", "overlays"].filter(
    (key) => payload[key] !== undefined,
  );
};

const createArchive = (sourceRoot, extensionDirectoryName, artifactPath) => {
  const result = spawnSync(
    "tar",
    ["-czf", artifactPath, "-C", sourceRoot, extensionDirectoryName],
    {
      stdio: "pipe",
      encoding: "utf8",
    },
  );

  if (result.status === 0) {
    return;
  }

  const stderr = result.stderr?.trim();
  const stdout = result.stdout?.trim();
  throw new Error(
    `Failed to package ${extensionDirectoryName}: ${stderr || stdout || "unknown tar failure"}`,
  );
};

const sha256 = (buffer) => {
  return createHash("sha256").update(buffer).digest("hex");
};

const fileExists = async (filePath) => {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
};

const readManifest = async (manifestPath) => {
  const source = await readFile(manifestPath, "utf8");
  const parsed = parseJsonc(source);

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Invalid manifest object: ${manifestPath}`);
  }

  return parsed;
};

const bySemverDesc = (left, right) => semver.rcompare(left, right);

const generateRegistry = async () => {
  await mkdir(artifactsRoot, { recursive: true });

  const extensionEntries = await readdir(extensionsRoot, {
    withFileTypes: true,
  });
  const extensionDirectories = extensionEntries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  const extensions = {};
  const expectedArtifacts = new Set();

  for (const extensionDirectoryName of extensionDirectories) {
    const extensionDirectoryPath = path.join(
      extensionsRoot,
      extensionDirectoryName,
    );
    const manifestPath = path.join(extensionDirectoryPath, "manifest.jsonc");
    const manifest = await readManifest(manifestPath);

    const id = String(manifest.id ?? "").trim();
    const version = String(manifest.version ?? "").trim();
    const description = String(manifest.description ?? "").trim();

    if (!id || !version || !description) {
      throw new Error(`Missing required manifest fields in ${manifestPath}`);
    }

    const artifactName = `${id}-${version}.tgz`;
    const artifactPath = path.join(artifactsRoot, artifactName);
    expectedArtifacts.add(artifactName);

    const artifactAlreadyExists = await fileExists(artifactPath);
    if (!artifactAlreadyExists) {
      createArchive(extensionsRoot, extensionDirectoryName, artifactPath);
    }

    const artifactBuffer = await readFile(artifactPath);
    const sizeBytes = (await stat(artifactPath)).size;
    const extensionRecord = extensions[id] ?? {
      latest: version,
      versions: {},
    };

    extensionRecord.versions[version] = {
      archiveUrl: `${artifactBaseUrl}/${artifactName}`,
      sha256: sha256(artifactBuffer),
      sizeBytes,
      compatibility: manifest.compatibility ?? {},
      description,
      payloadTypes: toPayloadTypes(manifest),
    };

    extensionRecord.latest =
      Object.keys(extensionRecord.versions).sort(bySemverDesc)[0] ?? version;
    extensions[id] = extensionRecord;
  }

  const existingArtifacts = await readdir(artifactsRoot, {
    withFileTypes: true,
  });
  for (const entry of existingArtifacts) {
    if (!entry.isFile()) {
      continue;
    }

    if (expectedArtifacts.has(entry.name)) {
      continue;
    }

    await rm(path.join(artifactsRoot, entry.name), { force: true });
  }

  const index = {
    registryVersion: 1,
    generatedAt: new Date().toISOString(),
    extensions,
  };

  await mkdir(registryRoot, { recursive: true });
  await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");

  process.stdout.write(
    `Generated extension registry index with ${Object.keys(extensions).length} entries at ${indexPath}\n`,
  );
};

generateRegistry().catch((error) => {
  const err = error;
  process.stderr.write(`${err.message}\n`);
  process.exitCode = 1;
});
