import { loadRuntimeHealthSnapshot } from "./health.server.js"

type ApiHealthLoaderDependencies = {
  loadRuntimeHealth: () => ReturnType<typeof loadRuntimeHealthSnapshot>
}

const defaultDependencies: ApiHealthLoaderDependencies = {
  loadRuntimeHealth: loadRuntimeHealthSnapshot,
}

/**
 * Creates the API health route loader with injectable dependencies so route-level behavior
 * can be tested without a running Otto runtime.
 *
 * @param dependencies Optional dependency overrides for tests.
 * @returns React Router loader function for `/api/health`.
 */
export const createApiHealthLoader = (
  dependencies: ApiHealthLoaderDependencies = defaultDependencies
) => {
  return async (): Promise<Response> => {
    const snapshot = await dependencies.loadRuntimeHealth()
    const statusCode = snapshot.status === "ok" ? 200 : 503

    return Response.json(snapshot, { status: statusCode })
  }
}

export const apiHealthLoader = createApiHealthLoader()
