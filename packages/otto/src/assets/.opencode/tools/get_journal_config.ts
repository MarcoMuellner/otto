import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"

import { tool } from "@opencode-ai/plugin"

const resolveConfigPath = (): string => {
  return path.join(homedir(), ".config", "opencode", "agent-memory.json")
}

export default tool({
  description:
    "Read OpenCode agent-memory journal configuration, including enabled state and suggested tags.",
  args: {},
  async execute(): Promise<string> {
    const configPath = resolveConfigPath()

    let source: string
    try {
      source = await readFile(configPath, "utf8")
    } catch (error) {
      const fileError = error as NodeJS.ErrnoException
      if (fileError.code === "ENOENT") {
        return JSON.stringify({ configPath, exists: false })
      }

      throw error
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(source)
    } catch {
      throw new Error(`Invalid JSON in ${configPath}`)
    }

    return JSON.stringify({
      configPath,
      exists: true,
      config: parsed,
    })
  },
})
