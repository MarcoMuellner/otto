export interface StartupInfo {
  host: string;
  port: number;
}

const STARTUP_BANNER = [
  "  ____  _   _         ",
  " / __ \\| | | |        ",
  "| |  | | |_| |_ ___    ",
  "| |  | | __| __/ _ \\   ",
  "| |__| | |_| || (_) |  ",
  " \\____/ \\__|\\__\\___/   ",
  "          Otto Gateway  ",
].join("\n");

/**
 * Prints the startup banner and connection info.
 */
export function logStartup(info: StartupInfo) {
  const message = [
    "",
    STARTUP_BANNER,
    "",
    `Listening on ${info.host}:${info.port}`,
    "WebSocket: /ws",
    "REST: /api",
    "Docs: /docs",
    "OpenAPI: /openapi.json",
  ].join("\n");
  // eslint-disable-next-line no-console
  console.log(message);
}
