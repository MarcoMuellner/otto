import path from "node:path";

import {
  formatValidationReport,
  resolveDefaultExtensionCatalogRoot,
  validateExtensionCatalog,
} from "./catalog.js";

type ValidateCommandOptions = {
  json: boolean;
  catalogRoot: string;
  extensionId?: string;
};

const parseArgs = (args: string[]): ValidateCommandOptions => {
  let json = false;
  let extensionId: string | undefined;
  let catalogRoot = resolveDefaultExtensionCatalogRoot();

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--") {
      continue;
    }

    if (arg === "--json") {
      json = true;
      continue;
    }

    if (arg === "--id") {
      const value = args[index + 1];
      if (!value) {
        throw new Error("Missing value for --id");
      }
      extensionId = value;
      index += 1;
      continue;
    }

    if (arg === "--catalog") {
      const value = args[index + 1];
      if (!value) {
        throw new Error("Missing value for --catalog");
      }
      catalogRoot = path.resolve(value);
      index += 1;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      throw new Error("USAGE");
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return {
    json,
    catalogRoot,
    extensionId,
  };
};

const usageText = `Usage: pnpm run extensions:validate -- [options]

Options:
  --json              Emit machine-readable JSON output
  --id <extension>    Validate only one extension id
  --catalog <path>    Override catalog root path
  -h, --help          Show this help
`;

export const runExtensionCatalogValidationCommand = async (
  args: string[],
  stdout: Pick<Console, "log"> = console,
  stderr: Pick<Console, "error"> = console,
): Promise<number> => {
  let options: ValidateCommandOptions;
  try {
    options = parseArgs(args);
  } catch (error) {
    const err = error as Error;
    if (err.message === "USAGE") {
      stdout.log(usageText);
      return 0;
    }

    stderr.error(`${err.message}\n${usageText}`);
    return 2;
  }

  const result = await validateExtensionCatalog(
    options.catalogRoot,
    options.extensionId,
  );

  if (options.json) {
    stdout.log(JSON.stringify(result, null, 2));
  } else {
    stdout.log(
      formatValidationReport(result, options.catalogRoot, options.extensionId),
    );
  }

  return result.ok ? 0 : 1;
};
