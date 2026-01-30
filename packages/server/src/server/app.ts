import fastify from "fastify";

import { securedApiPlugin } from "@server/server/api";

export interface BuildServerOptions {
  authToken: string;
}

/**
 * Builds the Fastify server with REST routes and auth enforcement.
 */
export function buildServer(options: BuildServerOptions) {
  if (!options.authToken) {
    throw new Error("authToken is required");
  }

  const app = fastify();

  app.get("/health", async () => ({ status: "ok" }));

  app.register(securedApiPlugin, {
    authToken: options.authToken,
    prefix: "/api",
  });

  return app;
}
