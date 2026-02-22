import { describe, expect, it } from "vitest"

import {
  createApiSettingsNotificationProfileAction,
  createApiSettingsNotificationProfileLoader,
} from "../../app/server/api-settings-notification-profile-route.server.js"
import { OttoExternalApiError } from "../../app/server/otto-external-api.server.js"

describe("api.settings.notification-profile loader", () => {
  it("returns profile payload on success", async () => {
    // Arrange
    const loader = createApiSettingsNotificationProfileLoader({
      loadNotificationProfile: async () => {
        return {
          profile: {
            timezone: "Europe/Vienna",
            quietHoursStart: "21:00",
            quietHoursEnd: "07:30",
            quietMode: "critical_only",
            muteUntil: null,
            heartbeatMorning: "08:30",
            heartbeatMidday: "12:30",
            heartbeatEvening: "19:00",
            heartbeatCadenceMinutes: 180,
            heartbeatOnlyIfSignal: true,
            onboardingCompletedAt: null,
            lastDigestAt: null,
            updatedAt: 1_000,
          },
        }
      },
      updateNotificationProfile: async () => {
        throw new Error("unused in loader test")
      },
    })

    // Act
    const response = await loader()

    // Assert
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      profile: {
        timezone: "Europe/Vienna",
      },
    })
  })

  it("maps upstream failures", async () => {
    // Arrange
    const loader = createApiSettingsNotificationProfileLoader({
      loadNotificationProfile: async () => {
        throw new OttoExternalApiError("Runtime unavailable", 503)
      },
      updateNotificationProfile: async () => {
        throw new Error("unused in loader test")
      },
    })

    // Act
    const response = await loader()

    // Assert
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({
      error: "runtime_unavailable",
    })
  })
})

describe("api.settings.notification-profile action", () => {
  it("updates profile via PUT", async () => {
    // Arrange
    const action = createApiSettingsNotificationProfileAction({
      loadNotificationProfile: async () => {
        throw new Error("unused in action test")
      },
      updateNotificationProfile: async (input) => {
        expect(input).toMatchObject({
          timezone: "Europe/Vienna",
          quietHoursStart: "22:00",
        })

        return {
          profile: {
            timezone: "Europe/Vienna",
            quietHoursStart: "22:00",
            quietHoursEnd: "07:00",
            quietMode: "critical_only",
            muteUntil: null,
            heartbeatMorning: "08:30",
            heartbeatMidday: "12:30",
            heartbeatEvening: "19:00",
            heartbeatCadenceMinutes: 180,
            heartbeatOnlyIfSignal: true,
            onboardingCompletedAt: null,
            lastDigestAt: null,
            updatedAt: 2_000,
          },
          changedFields: ["quietHoursStart", "quietHoursEnd", "updatedAt"],
        }
      },
    })

    // Act
    const response = await action({
      request: new Request("http://localhost/api/settings/notification-profile", {
        method: "PUT",
        body: JSON.stringify({
          timezone: "Europe/Vienna",
          quietHoursStart: "22:00",
          quietHoursEnd: "07:00",
        }),
      }),
    })

    // Assert
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      changedFields: expect.arrayContaining(["quietHoursStart", "quietHoursEnd"]),
    })
  })

  it("rejects non-put methods", async () => {
    // Arrange
    const action = createApiSettingsNotificationProfileAction({
      loadNotificationProfile: async () => {
        throw new Error("unused in action test")
      },
      updateNotificationProfile: async () => {
        throw new Error("should not run")
      },
    })

    // Act
    const response = await action({
      request: new Request("http://localhost/api/settings/notification-profile", {
        method: "POST",
      }),
    })

    // Assert
    expect(response.status).toBe(405)
  })
})
