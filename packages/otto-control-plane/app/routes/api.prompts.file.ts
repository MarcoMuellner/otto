import {
  apiPromptsFileAction,
  apiPromptsFileLoader,
} from "../server/api-prompts-file-route.server.js"

export const loader = apiPromptsFileLoader
export const action = apiPromptsFileAction
