import { runExtensionCatalogValidationCommand } from "otto-extension-sdk"

const exitCode = await runExtensionCatalogValidationCommand(process.argv.slice(2))
process.exitCode = exitCode
