import { buildBootstrapMessage } from "./bootstrap/message.js"
import { parseCommand } from "./cli/command.js"
import { runCommand } from "./cli/runner.js"
import { createComponentLogger, logger } from "./logging/logger.js"
import { runServe } from "./runtime/serve.js"
import { runSetup } from "./runtime/setup.js"

const startedAt = new Date().toISOString()

logger.info({ startedAt }, buildBootstrapMessage(startedAt))

const main = async (): Promise<void> => {
  const command = parseCommand(process.argv.slice(2))
  const commandLogger = createComponentLogger(command)

  await runCommand(command, commandLogger, {
    setup: runSetup,
    serve: runServe,
  })
}

main().catch((error) => {
  const err = error as Error
  logger.error({ error: err.message }, "Otto runtime failed")
  process.exitCode = 1
})
