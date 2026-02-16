import { readFile } from "node:fs/promises"

import { createOpencodeServer } from "@opencode-ai/sdk"

type ServeServerInput = {
  hostname: string
  port: number
  configPath: string
}

type OpencodeServerHandle = {
  url: string
  close: () => void
}

/**
 * Verifies persisted OpenCode config is syntactically usable before boot so server failures
 * surface as clear setup errors instead of opaque runtime crashes.
 *
 * @param configPath Absolute path to deployed OpenCode config.
 * @returns Parsed config object used for validity checks.
 */
const parseOpencodeConfig = async (configPath: string): Promise<Record<string, unknown>> => {
  const source = await readFile(configPath, "utf8")

  try {
    const parsed = JSON.parse(source)

    if (typeof parsed !== "object" || parsed === null) {
      throw new Error("OpenCode config must be an object")
    }

    return parsed as Record<string, unknown>
  } catch {
    throw new Error(`Invalid JSON in OpenCode config: ${configPath}`)
  }
}

/**
 * Starts OpenCode through the SDK to keep server lifecycle management centralized in typed
 * application code rather than shell orchestration.
 *
 * @param input Runtime network settings and deployed config location.
 * @returns Minimal server handle used by Otto runtime control flow.
 */
export const startOpencodeServer = async ({
  hostname,
  port,
  configPath,
}: ServeServerInput): Promise<OpencodeServerHandle> => {
  await parseOpencodeConfig(configPath)
  const server = await createOpencodeServer({ hostname, port })

  return {
    url: server.url,
    close: () => server.close(),
  }
}
