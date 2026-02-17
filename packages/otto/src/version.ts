/**
 * Stores the build version embedded into Otto artifacts so runtime logs and support reports
 * can always identify the exact release flavor in use.
 */
export const APP_VERSION = "0.1.0-dev"

/**
 * Exposes a single version accessor so callers do not depend on where build metadata is stored.
 *
 * @returns Build version identifier embedded during build.
 */
export const getAppVersion = (): string => {
  return APP_VERSION
}
