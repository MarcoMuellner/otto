import net from "node:net";

/**
 * Finds the next available TCP port starting at the provided value.
 */
export async function findAvailablePort(port: number): Promise<number> {
  if (port === 0) {
    return 0;
  }

  let candidate = port;

  while (!(await isPortAvailable(candidate))) {
    candidate += 1;
  }

  return candidate;
}

async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", () => {
      resolve(false);
    });

    server.once("listening", () => {
      server.close(() => resolve(true));
    });

    server.listen(port);
  });
}
