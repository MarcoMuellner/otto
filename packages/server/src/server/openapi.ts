import type { FastifyInstance } from "fastify";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { jsonSchemaTransform } from "fastify-type-provider-zod";
import { z } from "zod";

/**
 * Registers OpenAPI documentation endpoints.
 */
export function registerOpenApi(app: FastifyInstance) {
  app.register(swagger, {
    openapi: {
      info: {
        title: "Otto Gateway",
        version: "0.0.0",
      },
    },
    transform: jsonSchemaTransform,
  });

  app.register(swaggerUi, {
    routePrefix: "/docs",
  });

  app.get(
    "/openapi.json",
    {
      schema: {
        response: {
          200: z.unknown(),
        },
      },
    },
    async () => app.swagger(),
  );
}
