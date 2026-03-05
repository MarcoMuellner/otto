import path from "node:path"
import { mkdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"

import pino from "pino"

import { buildExternalApiServer } from "../src/external-api/server.js"
import { buildInternalApiServer } from "../src/internal-api/server.js"
import {
  createCommandAuditRepository,
  createJobRunSessionsRepository,
  createJobsRepository,
  createOutboundMessagesRepository,
  createSessionBindingsRepository,
  createTaskAuditRepository,
  createUserProfileRepository,
  openPersistenceDatabase,
} from "../src/persistence/index.js"

const run = async (): Promise<void> => {
  const root = path.resolve(import.meta.dirname, "..")
  const docsDir = path.join(root, "docs", "openapi")
  const dbPath = path.join(tmpdir(), `otto-openapi-${Date.now()}.db`)
  const logger = pino({ enabled: false })
  const db = openPersistenceDatabase({ dbPath })

  const jobsRepository = createJobsRepository(db)
  const taskAuditRepository = createTaskAuditRepository(db)
  const commandAuditRepository = createCommandAuditRepository(db)
  const userProfileRepository = createUserProfileRepository(db)
  const outboundMessagesRepository = createOutboundMessagesRepository(db)
  const sessionBindingsRepository = createSessionBindingsRepository(db)
  const jobRunSessionsRepository = createJobRunSessionsRepository(db)

  const external = buildExternalApiServer({
    logger,
    config: {
      host: "127.0.0.1",
      port: 4190,
      token: "docs-token",
      tokenPath: "/dev/null",
      baseUrl: "http://127.0.0.1:4190",
    },
    jobsRepository,
    taskAuditRepository,
    commandAuditRepository,
    userProfileRepository,
  })

  const internal = buildInternalApiServer({
    logger,
    config: {
      host: "127.0.0.1",
      port: 4180,
      token: "docs-token",
      tokenPath: "/dev/null",
      baseUrl: "http://127.0.0.1:4180",
    },
    outboundMessagesRepository,
    sessionBindingsRepository,
    jobsRepository,
    jobRunSessionsRepository,
    taskAuditRepository,
    commandAuditRepository,
    userProfileRepository,
  })

  try {
    await external.ready()
    await internal.ready()

    const externalResponse = await external.inject({
      method: "GET",
      url: "/external/openapi.json",
    })
    const internalResponse = await internal.inject({
      method: "GET",
      url: "/internal/openapi.json",
    })

    if (externalResponse.statusCode !== 200) {
      throw new Error(`Failed generating external OpenAPI: ${externalResponse.statusCode}`)
    }

    if (internalResponse.statusCode !== 200) {
      throw new Error(`Failed generating internal OpenAPI: ${internalResponse.statusCode}`)
    }

    const externalSpec = externalResponse.json()
    const internalSpec = internalResponse.json()

    await mkdir(docsDir, { recursive: true })
    await writeFile(path.join(docsDir, "external.v1.json"), JSON.stringify(externalSpec, null, 2))
    await writeFile(path.join(docsDir, "internal.v1.json"), JSON.stringify(internalSpec, null, 2))
  } finally {
    await external.close()
    await internal.close()
    db.close()
  }
}

await run()
