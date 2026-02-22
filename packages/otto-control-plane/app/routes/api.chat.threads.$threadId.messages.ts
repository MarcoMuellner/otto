import {
  apiChatThreadMessagesAction,
  apiChatThreadMessagesLoader,
} from "../server/api-chat-thread-messages-route.server.js"

export const loader = apiChatThreadMessagesLoader
export const action = apiChatThreadMessagesAction
