import { buildBootstrapMessage } from "./bootstrap/message.js"

const startedAt = new Date().toISOString()

console.log(buildBootstrapMessage(startedAt))
