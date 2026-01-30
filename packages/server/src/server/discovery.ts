import { Bonjour } from "bonjour-service";

export interface DiscoveryOptions {
  name: string;
  port: number;
}

export interface DiscoveryHandle {
  stop: () => Promise<void>;
}

/**
 * Publishes the server via mDNS for local discovery.
 */
export function startDiscovery(options: DiscoveryOptions): DiscoveryHandle {
  const bonjour = new Bonjour();
  const service = bonjour.publish({
    name: options.name,
    type: "otto",
    protocol: "tcp",
    port: options.port,
  });

  return {
    stop: async () => {
      await new Promise<void>((resolve) => {
        if (service.stop) {
          service.stop(() => resolve());
          return;
        }
        resolve();
      });
      bonjour.destroy();
    },
  };
}
