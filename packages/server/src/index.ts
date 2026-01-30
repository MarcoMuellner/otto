import { bootstrap } from "@server/server/bootstrap";
import { logStartup } from "@server/server/startup";

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

/**
 * Starts the server using the default test token.
 */
export function runServer() {
  return startServer({ authToken: "test-token" }).then((runtime) => {
    logStartup({ host: DEFAULT_HOST, port: DEFAULT_PORT });
    return runtime;
  });
}

if (import.meta.url === new URL(process.argv[1] ?? "", "file:").href) {
  runServer().catch(() => undefined);
}
