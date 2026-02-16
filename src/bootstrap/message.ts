/**
 * Keeps startup output in a single recognizable format so logs remain glanceable
 * across local development, daemon logs, and deployment smoke checks.
 *
 * @param isoTimestamp ISO timestamp injected by the caller for deterministic log records.
 * @returns Canonical startup log line used by Otto runtimes.
 */
export const buildBootstrapMessage = (isoTimestamp: string): string => {
  return `[otto] bootstrap ready (${isoTimestamp})`
}
