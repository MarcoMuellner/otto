type Deferred = {
  promise: Promise<void>
  resolve: () => void
}

const createDeferred = (): Deferred => {
  let resolve = (): void => {
    throw new Error("Deferred resolver not initialized")
  }

  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise
  })

  return {
    promise,
    resolve,
  }
}

export type DoctorLockSerializer = {
  runWithKey: <T>(key: string, task: () => Promise<T>) => Promise<T>
}

/**
 * Serializes task execution by lock key so mutating checks that touch the same integration
 * never overlap while unrelated checks still run concurrently.
 */
export const createDoctorLockSerializer = (): DoctorLockSerializer => {
  const lockTails = new Map<string, Promise<void>>()

  const runWithKey = async <T>(key: string, task: () => Promise<T>): Promise<T> => {
    const normalizedKey = key.trim()

    if (normalizedKey.length === 0) {
      return task()
    }

    const previousTail = lockTails.get(normalizedKey) ?? Promise.resolve()
    const currentTail = createDeferred()

    lockTails.set(normalizedKey, currentTail.promise)

    await previousTail

    try {
      return await task()
    } finally {
      currentTail.resolve()

      if (lockTails.get(normalizedKey) === currentTail.promise) {
        lockTails.delete(normalizedKey)
      }
    }
  }

  return {
    runWithKey,
  }
}
