import websocket from "@fastify/websocket";
import type { FastifyPluginAsync } from "fastify";

import { getAuthToken } from "@server/server/auth";

export interface WebSocketPluginOptions {
  authToken: string;
}

/**
 * Registers the websocket endpoint with token auth.
 */
export const webSocketPlugin: FastifyPluginAsync<
  WebSocketPluginOptions
> = async (app, options) => {
  if (!options.authToken) {
    throw new Error("authToken is required");
  }

  await app.register(websocket);

  app.get(
    "/ws",
    {
      websocket: true,
      preHandler: async (request, reply) => {
        const token = getAuthToken(request);
        if (token !== options.authToken) {
          reply.header("WWW-Authenticate", "Bearer").code(401).send({
            error: "unauthorized",
          });
          return reply;
        }
      },
    },
    (connection) => {
      connection.socket.on("message", () => undefined);
    },
  );
};
