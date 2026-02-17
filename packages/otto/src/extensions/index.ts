export {
  createExtensionStateRepository,
  ensureExtensionPersistenceDirectories,
  ExtensionStateError,
  resolveExtensionPersistencePaths,
} from "./state.js"
export {
  disableExtension,
  installExtension,
  listExtensions,
  removeExtension,
  updateAllExtensions,
  updateExtension,
} from "./operator.js"
export type {
  ExtensionStateRecord,
  ExtensionStateRepository,
  RemoveExtensionVersionGuard,
} from "./state.js"
export type {
  ExtensionInstallResult,
  ExtensionOperatorListResult,
  ExtensionRemoveResult,
} from "./operator.js"
