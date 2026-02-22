import { createOttoExternalApiClientFromEnvironment } from "./otto-external-api.server.js"
import {
  mapJobsMutationErrorToResponse,
  mapJobsReadErrorToResponse,
  readJsonActionBody,
} from "./api-jobs-mutations.server.js"
import {
  type NotificationProfileResponse,
  type UpdateNotificationProfileRequest,
  type UpdateNotificationProfileResponse,
  updateNotificationProfileRequestSchema,
} from "../features/settings/contracts.js"

type ApiSettingsNotificationProfileDependencies = {
  loadNotificationProfile: () => Promise<NotificationProfileResponse>
  updateNotificationProfile: (
    input: UpdateNotificationProfileRequest
  ) => Promise<UpdateNotificationProfileResponse>
}

const defaultDependencies: ApiSettingsNotificationProfileDependencies = {
  loadNotificationProfile: async (): Promise<NotificationProfileResponse> => {
    const client = await createOttoExternalApiClientFromEnvironment()
    return client.getNotificationProfile()
  },
  updateNotificationProfile: async (
    input: UpdateNotificationProfileRequest
  ): Promise<UpdateNotificationProfileResponse> => {
    const client = await createOttoExternalApiClientFromEnvironment()
    return client.updateNotificationProfile(input)
  },
}

export const createApiSettingsNotificationProfileLoader = (
  dependencies: ApiSettingsNotificationProfileDependencies = defaultDependencies
) => {
  return async (): Promise<Response> => {
    try {
      const profile = await dependencies.loadNotificationProfile()
      return Response.json(profile, { status: 200 })
    } catch (error) {
      return mapJobsReadErrorToResponse(error)
    }
  }
}

export const createApiSettingsNotificationProfileAction = (
  dependencies: ApiSettingsNotificationProfileDependencies = defaultDependencies
) => {
  return async ({ request }: { request: Request }): Promise<Response> => {
    if (request.method.toUpperCase() !== "PUT") {
      return Response.json(
        {
          error: "method_not_allowed",
          message: "Only PUT is supported for /api/settings/notification-profile",
        },
        { status: 405 }
      )
    }

    const bodyResult = await readJsonActionBody(request)
    if (!bodyResult.ok) {
      return bodyResult.response
    }

    try {
      const payload = updateNotificationProfileRequestSchema.parse(bodyResult.body)
      const result = await dependencies.updateNotificationProfile(payload)
      return Response.json(result, { status: 200 })
    } catch (error) {
      return mapJobsMutationErrorToResponse(error)
    }
  }
}

export const apiSettingsNotificationProfileLoader = createApiSettingsNotificationProfileLoader()
export const apiSettingsNotificationProfileAction = createApiSettingsNotificationProfileAction()
