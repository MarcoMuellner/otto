import type { FastifyPluginAsync } from "fastify";

import { authPlugin, type AuthPluginOptions } from "@server/server/auth";

/**
 * Registers secured API routes under the plugin scope.
 */
export const securedApiPlugin: FastifyPluginAsync<AuthPluginOptions> = async (
  api,
  options,
) => {
  await authPlugin(api, options);

  api.get("/ping", async () => ({ ok: true }));
};
