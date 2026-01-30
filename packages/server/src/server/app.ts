import fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { z } from "zod";

import { securedApiPlugin } from "@server/server/api";
import { registerOpenApi } from "@server/server/openapi";
import { webSocketPlugin } from "@server/server/ws";

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

  const app = fastify().withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  registerOpenApi(app);

  app.get(
    "/health",
    {
      schema: {
        response: {
          200: z.object({ status: z.literal("ok") }),
        },
      },
    },
    async () => ({ status: "ok" as const }),
  );

  app.register(securedApiPlugin, {
    authToken: options.authToken,
    prefix: "/api",
  });

  app.register(webSocketPlugin, { authToken: options.authToken });

  return app;
}
