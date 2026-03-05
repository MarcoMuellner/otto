import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const compareNumericVersion = (left, right) => {
  const leftParts = left
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = right
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
  const maxLength = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftValue = leftParts[index] ?? 0;
    const rightValue = rightParts[index] ?? 0;
    if (leftValue !== rightValue) {
      return rightValue - leftValue;
    }
  }

  return 0;
};

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

export const updateDocsManifest = async ({
  manifestPath,
  version,
  tag,
  pathName,
  sha,
  publishedAt,
}) => {
  const nowIso = publishedAt ?? new Date().toISOString();

  let manifest = {
    latest: version,
    versions: [],
    generatedAt: nowIso,
  };

  try {
    const existingSource = await readFile(manifestPath, "utf8");
    const existingManifest = JSON.parse(existingSource);
    if (Array.isArray(existingManifest.versions)) {
      manifest = {
        latest: existingManifest.latest ?? version,
        versions: existingManifest.versions,
        generatedAt: existingManifest.generatedAt ?? nowIso,
      };
    }
  } catch (error) {
    const nodeError = error;
    if (nodeError?.code !== "ENOENT") {
      throw error;
    }
  }

  const entry = {
    version,
    tag,
    path: pathName,
    sha,
    publishedAt: nowIso,
  };

  const filteredEntries = manifest.versions.filter(
    (item) => item.version !== version,
  );
  filteredEntries.push(entry);
  filteredEntries.sort((left, right) =>
    compareNumericVersion(left.version, right.version),
  );

  const output = {
    latest: version,
    versions: filteredEntries,
    generatedAt: nowIso,
  };

  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  return output;
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const options = parseCliOptions(process.argv.slice(2));
  const manifestPath = options["manifest-path"];
  const version = options.version;
  const tag = options.tag;
  const pathName = options.path;
  const sha = options.sha ?? "";
  const publishedAt = options["published-at"];

  if (!manifestPath || !version || !tag || !pathName) {
    console.error(
      "Usage: node scripts/docs/update-manifest.mjs --manifest-path <path> --version <x.y.z> --tag <vx.y.z> --path </vx.y.z/> [--sha <sha>] [--published-at <iso>]",
    );
    process.exit(1);
  }

  const output = await updateDocsManifest({
    manifestPath,
    version,
    tag,
    pathName,
    sha,
    publishedAt,
  });
  console.log(
    `Updated docs manifest ${manifestPath} with latest=${output.latest}`,
  );
}
