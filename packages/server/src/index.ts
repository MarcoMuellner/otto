import { bootstrap } from "@server/server/bootstrap";

export interface StartServerOptions {
  authToken: string;
}

const DEFAULT_HOST = "0.0.0.0";
const DEFAULT_PORT = 14868;

/**
 * Starts the server with default network configuration.
 */
export function startServer(options: StartServerOptions) {
  return bootstrap({
    authToken: options.authToken,
    host: DEFAULT_HOST,
    port: DEFAULT_PORT,
  });
}
