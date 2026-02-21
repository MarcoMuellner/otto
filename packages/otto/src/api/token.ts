import { randomBytes } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

const TOKEN_FILE_NAME = "internal-api.token"

/**
 * Keeps the API bearer token in one stable location so both internal and external APIs
 * can share credentials without duplicating token lifecycle logic.
 *
 * @param ottoHome Otto home directory containing persistent runtime state.
 * @returns Absolute path to the persisted API token file.
 */
export const resolveApiTokenPath = (ottoHome: string): string => {
  return path.join(ottoHome, "secrets", TOKEN_FILE_NAME)
}

const generateToken = (): string => {
  return randomBytes(32).toString("hex")
}

/**
 * Reuses a previously generated API token when available, otherwise creates one once,
 * so all runtime API consumers authenticate with a restart-safe shared secret.
 *
 * @param tokenPath Absolute path to the token file.
 * @returns Existing or newly generated API token.
 */
export const resolveOrCreateApiToken = async (tokenPath: string): Promise<string> => {
  try {
    const existing = await readFile(tokenPath, "utf8")
    const token = existing.trim()
    if (token.length > 0) {
      return token
    }
  } catch (error) {
    const err = error as NodeJS.ErrnoException
    if (err.code !== "ENOENT") {
      throw error
    }
  }

  const token = generateToken()
  await mkdir(path.dirname(tokenPath), { recursive: true })
  await writeFile(tokenPath, `${token}\n`, { encoding: "utf8", mode: 0o600 })

  return token
}
