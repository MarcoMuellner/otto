import { spawn } from "node:child_process"
import os from "node:os"
import path from "node:path"
import readline from "node:readline"

import { listPromptFiles, type PromptFileEntry } from "./prompt-management/index.js"

type CliStreams = {
  stdout: Pick<Console, "log">
  stderr: Pick<Console, "error">
}

type PromptCliEnvironment = NodeJS.ProcessEnv

type PromptCliDependencies = {
  listPromptFiles: (input: { ottoHome: string }) => Promise<PromptFileEntry[]>
  pickPromptFile: (input: { entries: PromptFileEntry[] }) => Promise<PromptFileEntry | null>
  openEditor: (input: { filePath: string; environment: PromptCliEnvironment }) => Promise<void>
}

const usage = `Usage: prompt-cli [command]

Commands:
  list
  pick
`

type EditorCommandUnavailableError = Error & {
  code: "EDITOR_COMMAND_UNAVAILABLE"
  command: string
}

const createEditorCommandUnavailableError = (
  command: string,
  message: string
): EditorCommandUnavailableError => {
  const error = new Error(message) as EditorCommandUnavailableError
  error.code = "EDITOR_COMMAND_UNAVAILABLE"
  error.command = command
  return error
}

const parseEditorCommand = (value: string): { command: string; args: string[] } => {
  const normalized = value.trim()
  if (normalized.length === 0) {
    throw new Error("Editor command cannot be empty")
  }

  const parts: string[] = []
  let token = ""
  let quote: '"' | "'" | null = null
  let escaped = false

  for (const char of normalized) {
    if (escaped) {
      token += char
      escaped = false
      continue
    }

    if (char === "\\") {
      escaped = true
      continue
    }

    if (quote) {
      if (char === quote) {
        quote = null
      } else {
        token += char
      }
      continue
    }

    if (char === '"' || char === "'") {
      quote = char
      continue
    }

    if (char === " " || char === "\t") {
      if (token.length > 0) {
        parts.push(token)
        token = ""
      }
      continue
    }

    token += char
  }

  if (escaped || quote) {
    throw new Error(`Invalid editor command '${value}': unmatched escape or quote`)
  }

  if (token.length > 0) {
    parts.push(token)
  }

  const command = parts[0]
  if (!command) {
    throw new Error(`Invalid editor command '${value}': command is missing`)
  }

  return {
    command,
    args: parts.slice(1),
  }
}

const resolveEditorCandidates = (environment: PromptCliEnvironment): string[] => {
  const candidates = [environment.VISUAL, environment.EDITOR, "vi"]

  return [...new Set(candidates.map((candidate) => candidate?.trim() ?? "").filter(Boolean))]
}

const runEditorCommand = async (input: {
  editorCommand: string
  filePath: string
}): Promise<void> => {
  const parsed = parseEditorCommand(input.editorCommand)

  await new Promise<void>((resolve, reject) => {
    const child = spawn(parsed.command, [...parsed.args, input.filePath], {
      stdio: "inherit",
    })

    child.once("error", (error) => {
      const spawnError = error as NodeJS.ErrnoException
      if (spawnError.code === "ENOENT") {
        reject(
          createEditorCommandUnavailableError(
            input.editorCommand,
            `Editor '${input.editorCommand}' is not available on PATH`
          )
        )
        return
      }

      reject(new Error(`Failed to launch editor '${input.editorCommand}': ${spawnError.message}`))
    })

    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve()
        return
      }

      const reason = signal ? `signal ${signal}` : `code ${String(code ?? "unknown")}`
      reject(new Error(`Editor '${input.editorCommand}' exited with ${reason}`))
    })
  })
}

const openEditor = async (input: {
  filePath: string
  environment: PromptCliEnvironment
}): Promise<void> => {
  const candidates = resolveEditorCandidates(input.environment)
  const unavailableErrors: EditorCommandUnavailableError[] = []

  for (const candidate of candidates) {
    try {
      await runEditorCommand({
        editorCommand: candidate,
        filePath: input.filePath,
      })
      return
    } catch (error) {
      const err = error as Error & { code?: string }
      if (err.code === "EDITOR_COMMAND_UNAVAILABLE") {
        unavailableErrors.push(err as EditorCommandUnavailableError)
        continue
      }

      throw error
    }
  }

  if (unavailableErrors.length > 0) {
    const attempted = unavailableErrors.map((error) => `'${error.command}'`).join(", ")
    throw new Error(
      `No usable editor found. Attempted ${attempted}. Set $VISUAL or $EDITOR to an installed terminal editor.`
    )
  }

  throw new Error("No usable editor found. Set $VISUAL or $EDITOR to an installed terminal editor.")
}

const pickPromptFileInteractively = async (input: {
  entries: PromptFileEntry[]
}): Promise<PromptFileEntry | null> => {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("Interactive prompt picker requires a TTY terminal")
  }

  if (input.entries.length === 0) {
    return null
  }

  const stdin = process.stdin
  const stdout = process.stdout
  let selectedIndex = 0

  const render = () => {
    stdout.write("\u001b[2J\u001b[0f")
    stdout.write("Pick a prompt file (arrow keys, Enter to open, Esc/Ctrl+C to cancel)\n\n")

    for (const [index, entry] of input.entries.entries()) {
      const selected = index === selectedIndex
      const cursor = selected ? ">" : " "
      stdout.write(`${cursor} [${entry.source}] ${entry.relativePath}\n`)
    }
  }

  render()

  return await new Promise<PromptFileEntry | null>((resolve) => {
    const cleanup = () => {
      stdin.setRawMode(false)
      stdin.pause()
      stdin.removeListener("keypress", onKeypress)
      stdout.write("\n")
    }

    const finish = (value: PromptFileEntry | null) => {
      cleanup()
      resolve(value)
    }

    const onKeypress = (_str: string, key: readline.Key) => {
      if (key.name === "up") {
        selectedIndex = selectedIndex > 0 ? selectedIndex - 1 : input.entries.length - 1
        render()
        return
      }

      if (key.name === "down") {
        selectedIndex = selectedIndex < input.entries.length - 1 ? selectedIndex + 1 : 0
        render()
        return
      }

      if (key.name === "return") {
        finish(input.entries[selectedIndex] ?? null)
        return
      }

      if (key.name === "escape" || (key.ctrl && key.name === "c")) {
        finish(null)
      }
    }

    readline.emitKeypressEvents(stdin)
    stdin.setRawMode(true)
    stdin.resume()
    stdin.on("keypress", onKeypress)
  })
}

const defaultDependencies: PromptCliDependencies = {
  listPromptFiles,
  pickPromptFile: pickPromptFileInteractively,
  openEditor,
}

const printPromptInventory = (entries: PromptFileEntry[], streams: CliStreams): void => {
  if (entries.length === 0) {
    streams.stdout.log("No prompt files found under ~/.otto/prompts or ~/.otto/system-prompts")
    return
  }

  streams.stdout.log("source\tpath")
  for (const entry of entries) {
    streams.stdout.log(`${entry.source}\t${entry.relativePath}`)
  }
}

/**
 * Runs prompt inventory + interactive picker/edit workflow for ottoctl while keeping editor and
 * terminal interactions dependency-injectable for deterministic CLI tests.
 */
export const runPromptCliCommand = async (
  args: string[],
  streams: CliStreams = { stdout: console, stderr: console },
  environment: PromptCliEnvironment = process.env,
  dependencies: PromptCliDependencies = defaultDependencies
): Promise<number> => {
  try {
    const [command] = args
    const ottoHome = environment.OTTO_HOME ?? path.join(os.homedir(), ".otto")

    if (command === "help" || command === "--help" || command === "-h") {
      streams.stdout.log(usage)
      return 0
    }

    const entries = await dependencies.listPromptFiles({ ottoHome })

    if (command === "list") {
      printPromptInventory(entries, streams)
      return 0
    }

    if (command && command !== "pick") {
      throw new Error(`Unknown prompt command: ${command}`)
    }

    if (entries.length === 0) {
      throw new Error(
        `No prompt files found under '${path.join(ottoHome, "prompts")}' or '${path.join(ottoHome, "system-prompts")}'`
      )
    }

    const selected = await dependencies.pickPromptFile({ entries })
    if (!selected) {
      streams.stdout.log("Prompt picker cancelled")
      return 0
    }

    if (selected.source === "system") {
      streams.stderr.error(
        "Selected a system-owned prompt file. Changes may be overwritten by otto setup/update."
      )
    }

    await dependencies.openEditor({
      filePath: selected.absolutePath,
      environment,
    })
    return 0
  } catch (error) {
    const err = error as Error
    streams.stderr.error(err.message)
    return 1
  }
}

const isMainModule =
  typeof process.argv[1] === "string" &&
  (process.argv[1].endsWith("/prompt-cli.mjs") || process.argv[1].endsWith("\\prompt-cli.mjs"))

if (isMainModule) {
  runPromptCliCommand(process.argv.slice(2))
    .then((exitCode) => {
      process.exitCode = exitCode
    })
    .catch((error) => {
      const err = error as Error
      console.error(err.message)
      process.exitCode = 1
    })
}
