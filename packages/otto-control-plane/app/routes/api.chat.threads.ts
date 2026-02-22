import {
  apiChatThreadsAction,
  apiChatThreadsLoader,
} from "../server/api-chat-threads-route.server.js"

export const loader = apiChatThreadsLoader
export const action = apiChatThreadsAction
