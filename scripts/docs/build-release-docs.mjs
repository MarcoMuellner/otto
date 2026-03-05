import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDirectory, "../..");
const docsPackageRoot = path.join(repoRoot, "packages", "otto-docs");
const docusaurusBuildPath = path.join(docsPackageRoot, "build");

const runCommand = async (command, args, env) => {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: {
        ...process.env,
        ...env,
      },
      stdio: "inherit",
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve(undefined);
        return;
      }

      reject(new Error(`Command failed: ${command} ${args.join(" ")}`));
    });
  });
};

const ensureTrailingSlash = (value) => {
  if (value.endsWith("/")) {
    return value;
  }

  return `${value}/`;
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

const options = parseCliOptions(process.argv.slice(2));
const docsVersion = options.version ?? process.env.OTTO_DOCS_VERSION;
const docsTag = options.tag ?? process.env.OTTO_DOCS_TAG;
const siteUrl = options["site-url"] ?? process.env.OTTO_DOCS_SITE_URL;
const siteBaseUrl =
  options["site-base-url"] ??
  process.env.OTTO_DOCS_BASE_URL ??
  process.env.OTTO_DOCS_SITE_BASE_URL;
const outputDir =
  options["output-dir"] ?? path.join(repoRoot, "release", "docs-build");

if (!docsVersion || !docsTag || !siteUrl || !siteBaseUrl) {
  console.error(
    "Missing required metadata. Provide --version, --tag, --site-url, and --site-base-url (or OTTO_DOCS_VERSION, OTTO_DOCS_TAG, OTTO_DOCS_SITE_URL, OTTO_DOCS_BASE_URL env vars).",
  );
  process.exit(1);
}

const normalizedBaseUrl = ensureTrailingSlash(siteBaseUrl);
const normalizedVersionBaseUrl = ensureTrailingSlash(
  `${normalizedBaseUrl}${docsTag}/`,
);

const latestBuildDir = path.join(outputDir, "latest");
const versionBuildDir = path.join(outputDir, docsTag);

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

console.log(
  `Docs release mapping: tag=${docsTag} version=${docsVersion} latest_base=${normalizedBaseUrl} version_base=${normalizedVersionBaseUrl}`,
);

await runCommand("pnpm", ["-C", "packages/otto-docs", "run", "build"], {
  OTTO_DOCS_VERSION: docsVersion,
  OTTO_DOCS_TAG: docsTag,
  OTTO_DOCS_SITE_URL: siteUrl,
  OTTO_DOCS_BASE_URL: normalizedBaseUrl,
});

await cp(docusaurusBuildPath, latestBuildDir, { recursive: true });

await runCommand("pnpm", ["-C", "packages/otto-docs", "run", "build"], {
  OTTO_DOCS_VERSION: docsVersion,
  OTTO_DOCS_TAG: docsTag,
  OTTO_DOCS_SITE_URL: siteUrl,
  OTTO_DOCS_BASE_URL: normalizedVersionBaseUrl,
});

await cp(docusaurusBuildPath, versionBuildDir, { recursive: true });

console.log(`Built docs release artifacts in ${outputDir}`);
