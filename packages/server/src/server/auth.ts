import type { FastifyPluginAsync, FastifyRequest } from "fastify";

export interface AuthPluginOptions {
  authToken: string;
}

/**
 * Extracts an auth token from headers or query string.
 */
export function getAuthToken(request: FastifyRequest): string | null {
  const authHeader = request.headers.authorization;
  const prefix = "Bearer ";
  if (authHeader?.startsWith(prefix)) {
    return authHeader.slice(prefix.length);
  }

  const url = new URL(request.url, "http://localhost");
  const queryToken = url.searchParams.get("token");
  return queryToken ?? null;
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
    const token = getAuthToken(request);

    if (token !== options.authToken) {
      reply.header("WWW-Authenticate", "Bearer").code(401).send({
        error: "unauthorized",
      });
      return reply;
    }
  });
};
