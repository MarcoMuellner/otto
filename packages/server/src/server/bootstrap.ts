import { buildServer } from "@server/server/app";
import { startDiscovery } from "@server/server/discovery";
import { findAvailablePort } from "@server/server/port";

export interface BootstrapOptions {
  authToken: string;
  host: string;
  port: number;
}

export interface ServerRuntime {
  stop: () => Promise<void>;
}

/**
 * Starts the server and discovery services.
 */
export async function bootstrap(
  options: BootstrapOptions,
): Promise<ServerRuntime> {
  const server = buildServer({ authToken: options.authToken });
  const availablePort = await findAvailablePort(options.port);
  await server.listen({ host: options.host, port: availablePort });

  const address = server.server.address();
  const port = typeof address === "string" ? availablePort : address?.port;
  const discovery = startDiscovery({
    name: "otto",
    port: port ?? availablePort,
  });

  return {
    stop: async () => {
      await server.close();
      await discovery.stop();
    },
  };
}
