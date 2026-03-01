import { spawn } from "node:child_process"
import { accessSync, constants } from "node:fs"
import os from "node:os"
import path from "node:path"
import readline from "node:readline"

import {
  listPromptFileInventory,
  type PromptFileInventoryEntry,
  type PromptLayerSource,
} from "./prompt-management/index.js"

type CliStreams = {
  stdout: Pick<Console, "log">
  stderr: Pick<Console, "error">
}

type PromptCliEnvironment = NodeJS.ProcessEnv

type PickerSelection =
  | {
      status: "selected"
      entry: PromptFileInventoryEntry
    }
  | {
      status: "cancelled"
    }

type PromptCliDependencies = {
  listPromptFiles: (ottoHome: string) => Promise<PromptFileInventoryEntry[]>
  runPicker: (entries: PromptFileInventoryEntry[], streams: CliStreams) => Promise<PickerSelection>
  openInEditor: (
    entry: PromptFileInventoryEntry,
    environment: PromptCliEnvironment
  ) => Promise<{ command: string }>
}

const usage = `Usage: prompt-cli [options]

Commands:
  prompt
`

const DEFAULT_EDITORS = ["nano", "vim", "vi"] as const

const resolveSourceLabel = (source: PromptLayerSource): string => {
  return source === "user" ? "user" : "system"
}

const resolveOttoHome = (environment: PromptCliEnvironment): string => {
  return environment.OTTO_HOME ?? path.join(os.homedir(), ".otto")
}

export const resolveNextPickerIndex = (
  currentIndex: number,
  itemCount: number,
  direction: "up" | "down"
): number => {
  if (itemCount <= 0) {
    return 0
  }

  if (direction === "up") {
    return currentIndex <= 0 ? itemCount - 1 : currentIndex - 1
  }

  return currentIndex >= itemCount - 1 ? 0 : currentIndex + 1
}

const extractExecutableName = (command: string): string | null => {
  const trimmed = command.trim()
  if (trimmed.length === 0) {
    return null
  }

  const match = trimmed.match(/^"([^"]+)"|^'([^']+)'|^([^\s]+)/)
  const token = match ? (match[1] ?? match[2] ?? match[3]) : null

  return token?.trim().length ? token.trim() : null
}

const hasExecutable = (executable: string, environment: PromptCliEnvironment): boolean => {
  const trimmed = executable.trim()
  if (trimmed.length === 0) {
    return false
  }

  if (trimmed.includes(path.sep)) {
    try {
      accessSync(trimmed, constants.X_OK)
      return true
    } catch {
      return false
    }
  }

  const pathEntries = (environment.PATH ?? "").split(path.delimiter).filter(Boolean)

  for (const entry of pathEntries) {
    try {
      accessSync(path.join(entry, trimmed), constants.X_OK)
      return true
    } catch {
      continue
    }
  }

  return false
}

type EditorCandidate = {
  command: string
  fromEnvironment: boolean
}

export const resolveEditorCandidates = (environment: PromptCliEnvironment): EditorCandidate[] => {
  const candidates: EditorCandidate[] = []
  const seen = new Set<string>()

  const addCandidate = (command: string, fromEnvironment: boolean): void => {
    const normalized = command.trim()
    if (normalized.length === 0 || seen.has(normalized)) {
      return
    }

    seen.add(normalized)
    candidates.push({ command: normalized, fromEnvironment })
  }

  const editor = environment.EDITOR?.trim()
  const visual = environment.VISUAL?.trim()

  if (editor) {
    addCandidate(editor, true)
  }

  if (visual && visual !== editor) {
    addCandidate(visual, true)
  }

  for (const fallback of DEFAULT_EDITORS) {
    addCandidate(fallback, false)
  }

  return candidates
}

const runEditorCommand = async (
  command: string,
  filePath: string,
  useShell: boolean
): Promise<{ code: number | null; signal: NodeJS.Signals | null }> => {
  return await new Promise((resolve, reject) => {
    const child = useShell
      ? spawn(`${command} "${filePath.replaceAll('"', '\\"')}"`, {
          stdio: "inherit",
          shell: true,
        })
      : spawn(command, [filePath], {
          stdio: "inherit",
        })

    child.once("error", reject)
    child.once("close", (code, signal) => {
      resolve({ code, signal })
    })
  })
}

const openPromptInEditor = async (
  entry: PromptFileInventoryEntry,
  environment: PromptCliEnvironment
): Promise<{ command: string }> => {
  const candidates = resolveEditorCandidates(environment)
  let attempted = 0

  for (const candidate of candidates) {
    const executable = extractExecutableName(candidate.command)
    if (!executable || !hasExecutable(executable, environment)) {
      continue
    }

    attempted += 1

    const editorExit = await runEditorCommand(
      candidate.command,
      entry.absolutePath,
      candidate.fromEnvironment
    )
    if (editorExit.code === 0 && editorExit.signal === null) {
      return { command: candidate.command }
    }

    if (editorExit.signal) {
      throw new Error(`Editor '${candidate.command}' exited by signal ${editorExit.signal}`)
    }

    throw new Error(
      `Editor '${candidate.command}' exited with code ${editorExit.code ?? "unknown"}`
    )
  }

  if (attempted === 0) {
    throw new Error(
      "No usable editor found. Set $EDITOR (or $VISUAL) to an installed terminal editor (for example: nano, vim, vi)."
    )
  }

  throw new Error("Unable to open editor")
}

const clearScreen = (): void => {
  if (!process.stdout.isTTY) {
    return
  }

  process.stdout.write("\u001b[2J\u001b[H")
}

const renderPicker = (
  entries: PromptFileInventoryEntry[],
  selectedIndex: number,
  streams: CliStreams
): void => {
  clearScreen()
  streams.stdout.log("Select a prompt file to open")
  streams.stdout.log("Use Up/Down arrows, Enter to open, q or Esc to cancel")
  streams.stdout.log("")

  for (const [index, entry] of entries.entries()) {
    const cursor = index === selectedIndex ? ">" : " "
    streams.stdout.log(`${cursor} [${resolveSourceLabel(entry.source)}] ${entry.relativePath}`)
  }
}

const isInteractiveTerminal = (streams: CliStreams): boolean => {
  return (
    typeof process.stdin.setRawMode === "function" &&
    Boolean(process.stdin.isTTY) &&
    Boolean(process.stdout.isTTY) &&
    typeof streams.stdout.log === "function"
  )
}

const runInteractivePromptPicker = async (
  entries: PromptFileInventoryEntry[],
  streams: CliStreams
): Promise<PickerSelection> => {
  if (!isInteractiveTerminal(streams)) {
    throw new Error("Prompt picker requires an interactive terminal (TTY).")
  }

  if (entries.length === 0) {
    throw new Error(
      "No prompt markdown files found under ~/.otto/system-prompts or ~/.otto/prompts."
    )
  }

  return await new Promise((resolve) => {
    let selectedIndex = 0
    const hadRawMode = Boolean(process.stdin.isRaw)

    const cleanup = (): void => {
      process.stdin.off("keypress", onKeypress)
      if (!hadRawMode) {
        process.stdin.setRawMode(false)
      }
      process.stdin.pause()
      streams.stdout.log("")
    }

    const onKeypress = (_input: string, key: { name?: string; ctrl?: boolean }): void => {
      if (key.name === "up") {
        selectedIndex = resolveNextPickerIndex(selectedIndex, entries.length, "up")
        renderPicker(entries, selectedIndex, streams)
        return
      }

      if (key.name === "down") {
        selectedIndex = resolveNextPickerIndex(selectedIndex, entries.length, "down")
        renderPicker(entries, selectedIndex, streams)
        return
      }

      if (key.name === "return") {
        cleanup()
        resolve({
          status: "selected",
          entry: entries[selectedIndex]!,
        })
        return
      }

      if (key.name === "escape" || key.name === "q" || (key.ctrl && key.name === "c")) {
        cleanup()
        resolve({ status: "cancelled" })
      }
    }

    readline.emitKeypressEvents(process.stdin)
    process.stdin.on("keypress", onKeypress)
    if (!hadRawMode) {
      process.stdin.setRawMode(true)
    }
    process.stdin.resume()

    renderPicker(entries, selectedIndex, streams)
  })
}

const resolveSystemEditBlockMessage = (
  entry: PromptFileInventoryEntry,
  ottoHome: string
): string => {
  const userPath = path.join(ottoHome, "prompts", entry.relativePath)

  return [
    `Editing blocked for system-owned prompt: ${entry.relativePath}`,
    "System prompts are refreshed on setup/update and are not directly editable from this command.",
    `Edit or create the user-owned equivalent instead: ${userPath}`,
  ].join(" ")
}

/**
 * Runs the interactive prompt picker/editor command so operators can safely edit user-owned
 * prompts while keeping system-owned prompt files protected from accidental overwrite-prone edits.
 */
export const runPromptCliCommand = async (
  args: string[],
  streams: CliStreams = { stdout: console, stderr: console },
  environment: PromptCliEnvironment = process.env,
  dependencies: PromptCliDependencies = {
    listPromptFiles: (ottoHome) => listPromptFileInventory({ ottoHome }),
    runPicker: runInteractivePromptPicker,
    openInEditor: openPromptInEditor,
  }
): Promise<number> => {
  try {
    const [firstArg, ...rest] = args
    if (firstArg === "help" || firstArg === "--help" || firstArg === "-h") {
      streams.stdout.log(usage)
      return 0
    }

    if (firstArg && firstArg !== "prompt") {
      throw new Error(`Unknown prompt command: ${firstArg}`)
    }

    if (rest.length > 0) {
      throw new Error("Usage: prompt-cli")
    }

    const ottoHome = resolveOttoHome(environment)
    const files = await dependencies.listPromptFiles(ottoHome)
    const selection = await dependencies.runPicker(files, streams)
    if (selection.status === "cancelled") {
      streams.stdout.log("Prompt picker cancelled")
      return 0
    }

    if (selection.entry.source === "system") {
      throw new Error(resolveSystemEditBlockMessage(selection.entry, ottoHome))
    }

    const editorResult = await dependencies.openInEditor(selection.entry, environment)
    streams.stdout.log(
      `Opened [${resolveSourceLabel(selection.entry.source)}] ${selection.entry.relativePath} using ${editorResult.command}`
    )
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
