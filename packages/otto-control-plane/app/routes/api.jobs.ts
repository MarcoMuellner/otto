import { apiJobsAction, apiJobsLoader } from "../server/api-jobs-route.server.js"

export const loader = apiJobsLoader
export const action = apiJobsAction
