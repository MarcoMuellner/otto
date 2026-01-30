import { buildServer } from "@server/server/app";
import { startDiscovery } from "@server/server/discovery";

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
  await server.listen({ host: options.host, port: options.port });

  const address = server.server.address();
  const port = typeof address === "string" ? options.port : address?.port;
  const discovery = startDiscovery({
    name: "otto",
    port: port ?? options.port,
  });

  return {
    stop: async () => {
      await server.close();
      await discovery.stop();
    },
  };
}
