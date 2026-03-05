import { z } from "zod"

type OpenApiMethod = "get" | "post" | "put" | "delete" | "patch" | "head" | "options"
type OpenApiParameterIn = "path" | "query" | "header"

type OpenApiResponseSpec = {
  description: string
  schema?: z.ZodType
}

type OpenApiOperationSpec = {
  method: OpenApiMethod
  path: string
  tags: string[]
  summary: string
  description?: string
  security?: Array<Record<string, string[]>>
  pathParams?: z.ZodType
  query?: z.ZodType
  headers?: z.ZodType
  requestBody?: {
    required?: boolean
    description?: string
    schema: z.ZodType
  }
  responses: Record<number, OpenApiResponseSpec>
}

type OpenApiDocumentInput = {
  title: string
  version: string
  description: string
  tags: Array<{ name: string; description: string }>
  operations: OpenApiOperationSpec[]
  securitySchemes?: Record<string, unknown>
}

const zodToJsonSchema = (schema: z.ZodType): Record<string, unknown> => {
  const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>
  const cloned = { ...jsonSchema }
  delete cloned.$schema
  return cloned
}

const buildParameterSchemas = (
  schema: z.ZodType | undefined,
  location: OpenApiParameterIn
): Array<Record<string, unknown>> => {
  if (!schema || !(schema instanceof z.ZodObject)) {
    return []
  }

  const shape = (schema as z.ZodObject<Record<string, z.ZodType>>).shape
  const parameters: Array<Record<string, unknown>> = []

  for (const [name, propertySchema] of Object.entries(shape)) {
    parameters.push({
      name,
      in: location,
      required: location === "path" ? true : !propertySchema.isOptional(),
      schema: zodToJsonSchema(propertySchema),
    })
  }

  return parameters
}

export const buildOpenApiDocument = (input: OpenApiDocumentInput): Record<string, unknown> => {
  const paths: Record<string, Record<string, unknown>> = {}

  for (const operation of input.operations) {
    const normalizedPath = operation.path.replaceAll(/:([A-Za-z0-9_]+)/g, "{$1}")
    if (!paths[normalizedPath]) {
      paths[normalizedPath] = {}
    }

    const parameters = [
      ...buildParameterSchemas(operation.pathParams, "path"),
      ...buildParameterSchemas(operation.query, "query"),
      ...buildParameterSchemas(operation.headers, "header"),
    ]

    const responses: Record<string, unknown> = {}
    for (const [statusCode, response] of Object.entries(operation.responses)) {
      responses[statusCode] = response.schema
        ? {
            description: response.description,
            content: {
              "application/json": {
                schema: zodToJsonSchema(response.schema),
              },
            },
          }
        : {
            description: response.description,
          }
    }

    paths[normalizedPath][operation.method] = {
      tags: operation.tags,
      summary: operation.summary,
      ...(operation.description ? { description: operation.description } : {}),
      ...(parameters.length > 0 ? { parameters } : {}),
      ...(operation.requestBody
        ? {
            requestBody: {
              required: operation.requestBody.required ?? true,
              ...(operation.requestBody.description
                ? { description: operation.requestBody.description }
                : {}),
              content: {
                "application/json": {
                  schema: zodToJsonSchema(operation.requestBody.schema),
                },
              },
            },
          }
        : {}),
      responses,
      ...(operation.security ? { security: operation.security } : {}),
    }
  }

  return {
    openapi: "3.1.0",
    info: {
      title: input.title,
      version: input.version,
      description: input.description,
    },
    tags: input.tags,
    ...(input.securitySchemes
      ? {
          components: {
            securitySchemes: input.securitySchemes,
          },
        }
      : {}),
    paths,
  }
}

export type { OpenApiOperationSpec, OpenApiResponseSpec }
