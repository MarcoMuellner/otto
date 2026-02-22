import { z } from "zod"

const STORAGE_KEY = "otto.jobs.view-preferences.v1"

export const jobsViewPreferencesSchema = z.object({
  hideFinishedJobs: z.boolean(),
  showSystemJobs: z.boolean(),
})

export type JobsViewPreferences = z.infer<typeof jobsViewPreferencesSchema>

export const defaultJobsViewPreferences: JobsViewPreferences = {
  hideFinishedJobs: true,
  showSystemJobs: true,
}

export type JobsViewPreferencesStore = {
  load: () => JobsViewPreferences
  save: (preferences: JobsViewPreferences) => void
}

/**
 * Creates a frontend persistence adapter for jobs-view filter preferences so the MVP can keep
 * settings locally while preserving a single replaceable boundary for future backend storage.
 *
 * @param storage Browser storage instance or null for non-browser contexts.
 * @returns Store adapter with load/save helpers.
 */
export const createJobsViewPreferencesStore = (
  storage: Storage | null
): JobsViewPreferencesStore => {
  return {
    load: () => {
      if (!storage) {
        return defaultJobsViewPreferences
      }

      try {
        const raw = storage.getItem(STORAGE_KEY)
        if (!raw) {
          return defaultJobsViewPreferences
        }

        const parsed = jobsViewPreferencesSchema.safeParse(JSON.parse(raw))
        if (!parsed.success) {
          return defaultJobsViewPreferences
        }

        return parsed.data
      } catch {
        return defaultJobsViewPreferences
      }
    },
    save: (preferences) => {
      if (!storage) {
        return
      }

      storage.setItem(STORAGE_KEY, JSON.stringify(jobsViewPreferencesSchema.parse(preferences)))
    },
  }
}
