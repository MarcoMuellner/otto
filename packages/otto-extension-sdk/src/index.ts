export {
  formatValidationReport,
  resolveDefaultExtensionCatalogRoot,
  validateExtensionCatalog,
} from "./catalog.js";
export { parseJsonc } from "./jsonc.js";
export type {
  ExtensionCatalogEntry,
  ExtensionCatalogValidationResult,
  ExtensionManifest,
  ExtensionValidationIssue,
} from "./catalog.js";
export { runExtensionCatalogValidationCommand } from "./validate-command.js";
