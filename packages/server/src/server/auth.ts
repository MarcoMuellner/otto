import type { FastifyPluginAsync } from "fastify";

export interface AuthPluginOptions {
  authToken: string;
}

/**
 * Registers token-based auth for secured routes.
 */
export const authPlugin: FastifyPluginAsync<AuthPluginOptions> = async (
  app,
  options,
) => {
  if (!options.authToken) {
    throw new Error("authToken is required");
  }

  app.addHook("preHandler", async (request, reply) => {
    const authHeader = request.headers.authorization;
    const prefix = "Bearer ";
    const token = authHeader?.startsWith(prefix)
      ? authHeader.slice(prefix.length)
      : null;

    if (token !== options.authToken) {
      reply.header("WWW-Authenticate", "Bearer").code(401).send({
        error: "unauthorized",
      });
      return reply;
    }
  });
};
