const AUTHORIZATION_PREFIX = "Bearer "

/**
 * Normalizes bearer token extraction so HTTP adapters can share one auth-header parser
 * and avoid subtle inconsistencies across API surfaces.
 *
 * @param authorizationHeader Raw Authorization header value.
 * @returns Bearer token string when present and valid, otherwise null.
 */
export const extractBearerToken = (authorizationHeader: string | undefined): string | null => {
  if (!authorizationHeader?.startsWith(AUTHORIZATION_PREFIX)) {
    return null
  }

  const token = authorizationHeader.slice(AUTHORIZATION_PREFIX.length).trim()
  return token.length > 0 ? token : null
}
