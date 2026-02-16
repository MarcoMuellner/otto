import { buildBootstrapMessage } from "./bootstrap/message.js"
import { logger } from "./logging/logger.js"

const startedAt = new Date().toISOString()

logger.info({ startedAt }, buildBootstrapMessage(startedAt))
