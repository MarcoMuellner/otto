import {
  cp,
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { updateDocsManifest } from "./update-manifest.mjs";

const parseCliOptions = (argv) => {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      options[key] = "";
      continue;
    }

    options[key] = value;
    index += 1;
  }

  return options;
};

const listTopLevelEntries = async (dirPath) => {
  const entries = await readdir(dirPath, { withFileTypes: true });
  return entries.map((entry) => entry.name);
};

const copyExistingSiteContent = async (sourceDir, destinationDir) => {
  const existingEntries = await listTopLevelEntries(sourceDir);

  for (const entry of existingEntries) {
    if (entry === ".git") {
      continue;
    }

    await cp(path.join(sourceDir, entry), path.join(destinationDir, entry), {
      recursive: true,
    });
  }
};

const collectFiles = async (dirPath) => {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      const childFiles = await collectFiles(fullPath);
      files.push(...childFiles);
      continue;
    }

    files.push(fullPath);
  }

  return files;
};

const writeLatestAlias = async (outputDir) => {
  const latestDir = path.join(outputDir, "latest");
  await mkdir(latestDir, { recursive: true });
  await writeFile(
    path.join(latestDir, "index.html"),
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="refresh" content="0; url=../" />
    <title>Otto Docs Latest</title>
  </head>
  <body>
    <p>Redirecting to latest docs...</p>
  </body>
</html>
`,
    "utf8",
  );
};

const runIntegrityChecks = async ({ outputDir, docsTag, docsVersion }) => {
  const requiredPaths = [
    path.join(outputDir, "index.html"),
    path.join(outputDir, "docs", "intro"),
    path.join(outputDir, docsTag, "index.html"),
    path.join(outputDir, "versions.json"),
  ];

  for (const requiredPath of requiredPaths) {
    try {
      await stat(requiredPath);
    } catch {
      throw new Error(`Missing required docs artifact path: ${requiredPath}`);
    }
  }

  const forbiddenPatterns = [
    "/api/docs/live",
    "/api/self-awareness",
    "otto.docs.live.token",
    "OTTO_DOCS_LIVE_ENDPOINT",
  ];

  try {
    await stat(path.join(outputDir, "live"));
    throw new Error("Forbidden public docs route detected: /live");
  } catch (error) {
    if (error instanceof Error && error.message === "Forbidden public docs route detected: /live") {
      throw error;
    }

    if (!error || typeof error !== "object" || !("code" in error) || error.code !== "ENOENT") {
      throw error;
    }
  }

  const candidateFiles = (await collectFiles(outputDir)).filter((filePath) => {
    const extension = path.extname(filePath);
    return (
      extension === ".html" || extension === ".js" || extension === ".json"
    );
  });

  for (const filePath of candidateFiles) {
    const source = await readFile(filePath, "utf8");
    for (const forbiddenPattern of forbiddenPatterns) {
      if (source.includes(forbiddenPattern)) {
        throw new Error(
          `Forbidden runtime hook '${forbiddenPattern}' found in ${filePath}`,
        );
      }
    }
  }

  const manifestSource = await readFile(
    path.join(outputDir, "versions.json"),
    "utf8",
  );
  const manifest = JSON.parse(manifestSource);

  if (manifest.latest !== docsVersion) {
    throw new Error(
      `Manifest latest version mismatch: expected ${docsVersion}, got ${manifest.latest}`,
    );
  }

  const matchingEntry = manifest.versions.find(
    (entry) => entry.version === docsVersion,
  );
  if (!matchingEntry || matchingEntry.tag !== docsTag) {
    throw new Error(
      `Manifest mapping for ${docsVersion} -> ${docsTag} was not found`,
    );
  }
};

const options = parseCliOptions(process.argv.slice(2));
const existingDir = options["existing-dir"];
const latestBuildDir = options["latest-build-dir"];
const versionBuildDir = options["version-build-dir"];
const outputDir = options["output-dir"];
const docsTag = options.tag;
const docsVersion = options.version;
const docsSha = options.sha ?? "";
const publishedAt = options["published-at"];

if (
  !latestBuildDir ||
  !versionBuildDir ||
  !outputDir ||
  !docsTag ||
  !docsVersion
) {
  console.error(
    "Usage: node scripts/docs/merge-release-docs.mjs --latest-build-dir <path> --version-build-dir <path> --output-dir <path> --tag <vx.y.z> --version <x.y.z> [--existing-dir <path>] [--sha <sha>] [--published-at <iso>]",
  );
  process.exit(1);
}

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

if (existingDir) {
  await copyExistingSiteContent(existingDir, outputDir);
}

const latestEntries = await listTopLevelEntries(latestBuildDir);
for (const entry of latestEntries) {
  await rm(path.join(outputDir, entry), { recursive: true, force: true });
}

for (const entry of latestEntries) {
  await cp(path.join(latestBuildDir, entry), path.join(outputDir, entry), {
    recursive: true,
  });
}

await rm(path.join(outputDir, docsTag), { recursive: true, force: true });
await cp(versionBuildDir, path.join(outputDir, docsTag), { recursive: true });

await writeLatestAlias(outputDir);
await writeFile(path.join(outputDir, ".nojekyll"), "", "utf8");

await updateDocsManifest({
  manifestPath: path.join(outputDir, "versions.json"),
  version: docsVersion,
  tag: docsTag,
  pathName: `/${docsTag}/`,
  sha: docsSha,
  publishedAt,
});

await runIntegrityChecks({ outputDir, docsTag, docsVersion });

console.log(`Prepared GitHub Pages artifact in ${outputDir}`);
