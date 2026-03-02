import { spawn } from "node:child_process"
import { performance } from "node:perf_hooks"

import type { DoctorCheckDefinition, DoctorCheckOutput } from "../../contracts.js"

type CliSmokeCheckDependencies = {
  now?: () => number
  runCommand?: (
    command: string,
    args: readonly string[],
    timeoutMs: number
  ) => Promise<CommandRunResult>
}

type CommandRunResult = {
  exitCode: number | null
  signal: NodeJS.Signals | null
  durationMs: number
  timedOut: boolean
  timeoutSignal: NodeJS.Signals | null
}

type CliSmokeCommand = {
  id: string
  command: string
  args: readonly string[]
}

const COMMAND_TIMEOUT_MS = 8_000
const COMMAND_TIMEOUT_GRACE_MS = 1_000

const smokeCommands: readonly CliSmokeCommand[] = [
  {
    id: "task-list",
    command: "ottoctl",
    args: ["task", "list"],
  },
  {
    id: "model-list",
    command: "ottoctl",
    args: ["model", "list"],
  },
  {
    id: "extension-list",
    command: "ottoctl",
    args: ["extension", "list"],
  },
]

const defaultRunCommand = async (
  command: string,
  args: readonly string[],
  timeoutMs: number
): Promise<CommandRunResult> => {
  const startedAt = performance.now()

  return await new Promise((resolve, reject) => {
    let settled = false
    let timedOut = false
    let timeoutSignal: NodeJS.Signals | null = null

    const settle = (result: CommandRunResult): void => {
      if (settled) {
        return
      }

      settled = true
      clearTimeout(timeoutHandle)
      if (forceKillHandle !== null) {
        clearTimeout(forceKillHandle)
      }
      resolve(result)
    }

    const fail = (error: unknown): void => {
      if (settled) {
        return
      }

      settled = true
      clearTimeout(timeoutHandle)
      if (forceKillHandle !== null) {
        clearTimeout(forceKillHandle)
      }
      reject(error)
    }

    const child = spawn(command, args, {
      stdio: "ignore",
      env: process.env,
    })

    let forceKillHandle: NodeJS.Timeout | null = null

    const timeoutHandle = setTimeout(() => {
      if (settled) {
        return
      }

      timedOut = true
      timeoutSignal = "SIGTERM"
      child.kill("SIGTERM")

      forceKillHandle = setTimeout(() => {
        if (settled) {
          return
        }

        timeoutSignal = "SIGKILL"
        child.kill("SIGKILL")
        settle({
          exitCode: null,
          signal: "SIGKILL",
          durationMs: Math.round(performance.now() - startedAt),
          timedOut,
          timeoutSignal,
        })
      }, COMMAND_TIMEOUT_GRACE_MS)
    }, timeoutMs)

    child.once("error", (error) => {
      fail(error)
    })

    child.once("close", (code, signal) => {
      settle({
        exitCode: code,
        signal,
        durationMs: Math.round(performance.now() - startedAt),
        timedOut,
        timeoutSignal,
      })
    })
  })
}

export const createFastCliSmokeCheck = (
  dependencies: CliSmokeCheckDependencies = {}
): DoctorCheckDefinition => {
  const now = dependencies.now ?? (() => performance.now())
  const runCommand = dependencies.runCommand ?? defaultRunCommand

  return {
    id: "fast.cli.smoke",
    phase: "fast.core",
    tier: "fast",
    timeoutMs: 25_000,
    run: async (): Promise<DoctorCheckOutput> => {
      const failures: Array<{
        commandId: string
        command: string
        args: readonly string[]
        exitCode: number | null
        signal: NodeJS.Signals | null
        durationMs: number
        timedOut: boolean
        timeoutSignal: NodeJS.Signals | null
        error?: string
      }> = []

      const evidence: DoctorCheckOutput["evidence"] = []
      const checkStartedAt = now()

      for (const smokeCommand of smokeCommands) {
        const commandLabel = `${smokeCommand.command} ${smokeCommand.args.join(" ")}`

        try {
          const result = await runCommand(
            smokeCommand.command,
            smokeCommand.args,
            COMMAND_TIMEOUT_MS
          )

          evidence.push({
            code: "CLI_SMOKE_COMMAND_RESULT",
            message: `${commandLabel} exited with code ${result.exitCode ?? "null"}`,
            details: {
              command: commandLabel,
              commandId: smokeCommand.id,
              exitCode: result.exitCode,
              signal: result.signal,
              durationMs: result.durationMs,
              timedOut: result.timedOut,
              timeoutSignal: result.timeoutSignal,
            },
          })

          if (result.exitCode !== 0 || result.signal !== null) {
            failures.push({
              commandId: smokeCommand.id,
              command: smokeCommand.command,
              args: smokeCommand.args,
              exitCode: result.exitCode,
              signal: result.signal,
              durationMs: result.durationMs,
              timedOut: result.timedOut,
              timeoutSignal: result.timeoutSignal,
            })
          }
        } catch (error) {
          const err = error as Error
          failures.push({
            commandId: smokeCommand.id,
            command: smokeCommand.command,
            args: smokeCommand.args,
            exitCode: null,
            signal: null,
            durationMs: 0,
            timedOut: false,
            timeoutSignal: null,
            error: err.message,
          })

          evidence.push({
            code: "CLI_SMOKE_COMMAND_ERROR",
            message: `${commandLabel} failed to start`,
            details: {
              command: commandLabel,
              commandId: smokeCommand.id,
              error: err.message,
            },
          })
        }
      }

      const totalDurationMs = Math.round(now() - checkStartedAt)

      if (failures.length > 0) {
        return {
          severity: "error",
          summary: `CLI smoke checks failed (${failures.length}/${smokeCommands.length})`,
          evidence: [
            ...evidence,
            {
              code: "CLI_SMOKE_FAILED",
              message: "One or more critical CLI smoke commands failed",
              details: {
                failureCount: failures.length,
                totalCommands: smokeCommands.length,
                durationMs: totalDurationMs,
              },
            },
          ],
        }
      }

      return {
        severity: "ok",
        summary: "CLI smoke checks passed",
        evidence: [
          ...evidence,
          {
            code: "CLI_SMOKE_OK",
            message: "All critical CLI smoke commands succeeded",
            details: {
              totalCommands: smokeCommands.length,
              durationMs: totalDurationMs,
            },
          },
        ],
      }
    },
  }
}
