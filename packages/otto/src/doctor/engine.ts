import type { DoctorMode } from "../cli/command.js"
import {
  createDoctorCheckRegistry,
  doctorCheckOutputSchema,
  doctorCheckResultSchema,
  doctorRunResultSchema,
  type DoctorCheckDefinition,
  type DoctorCheckResult,
  type DoctorEvidence,
  type DoctorRunResult,
} from "./contracts.js"
import { createDoctorLockSerializer } from "./locks.js"
import { mapDoctorRunVerdict } from "./verdict.js"

const DEFAULT_CHECK_TIMEOUT_MS = 30_000

type RunDoctorEngineInput = {
  mode: DoctorMode
  checks: readonly DoctorCheckDefinition[]
  now?: () => number
}

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  return "Unknown error"
}

const getEligibleChecks = (
  checks: readonly DoctorCheckDefinition[],
  mode: DoctorMode
): DoctorCheckDefinition[] => {
  if (mode === "deep") {
    return [...checks]
  }

  return checks.filter((check) => check.tier === "fast")
}

const groupChecksByPhase = (
  checks: readonly DoctorCheckDefinition[]
): Array<{ phase: string; checks: DoctorCheckDefinition[] }> => {
  const phaseIndex = new Map<string, number>()
  const grouped: Array<{ phase: string; checks: DoctorCheckDefinition[] }> = []

  for (const check of checks) {
    const phase = check.phase
    const existingIndex = phaseIndex.get(phase)

    if (existingIndex === undefined) {
      phaseIndex.set(phase, grouped.length)
      grouped.push({
        phase,
        checks: [check],
      })
      continue
    }

    grouped[existingIndex].checks.push(check)
  }

  return grouped
}

const normalizeCheckResult = (
  check: DoctorCheckDefinition,
  now: () => number,
  startedAtMs: number,
  output: { severity: "ok" | "warning" | "error"; summary: string; evidence: DoctorEvidence[] },
  timedOut: boolean
): DoctorCheckResult => {
  return doctorCheckResultSchema.parse({
    id: check.id,
    phase: check.phase,
    tier: check.tier,
    severity: output.severity,
    summary: output.summary,
    evidence: output.evidence,
    durationMs: Math.max(0, now() - startedAtMs),
    timedOut,
  })
}

const executeCheck = async (
  check: DoctorCheckDefinition,
  mode: DoctorMode,
  now: () => number
): Promise<DoctorCheckResult> => {
  const startedAtMs = now()
  const timeoutMs = check.timeoutMs ?? DEFAULT_CHECK_TIMEOUT_MS
  const hasTimeoutBudget = Number.isFinite(timeoutMs) && timeoutMs > 0
  let timedOut = false
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null

  if (hasTimeoutBudget) {
    timeoutHandle = setTimeout(() => {
      timedOut = true
    }, timeoutMs)
  }

  try {
    const rawOutput = await check.run({ mode })

    if (timedOut) {
      return normalizeCheckResult(
        check,
        now,
        startedAtMs,
        {
          severity: "error",
          summary: `Check timed out after ${timeoutMs}ms`,
          evidence: [
            {
              code: "TIMEOUT",
              message: `Check exceeded timeout budget of ${timeoutMs}ms`,
            },
          ],
        },
        true
      )
    }

    const parsedOutput = doctorCheckOutputSchema.parse(rawOutput)

    return normalizeCheckResult(check, now, startedAtMs, parsedOutput, false)
  } catch (error) {
    if (timedOut) {
      return normalizeCheckResult(
        check,
        now,
        startedAtMs,
        {
          severity: "error",
          summary: `Check timed out after ${timeoutMs}ms`,
          evidence: [
            {
              code: "TIMEOUT",
              message: `Check exceeded timeout budget of ${timeoutMs}ms`,
            },
          ],
        },
        true
      )
    }

    return normalizeCheckResult(
      check,
      now,
      startedAtMs,
      {
        severity: "error",
        summary: "Check execution failed",
        evidence: [
          {
            code: "CHECK_EXECUTION_ERROR",
            message: toErrorMessage(error),
          },
        ],
      },
      false
    )
  } finally {
    if (timeoutHandle !== null) {
      clearTimeout(timeoutHandle)
    }
  }
}

const createInternalFailureResult = (
  mode: DoctorMode,
  now: () => number,
  startedAtMs: number,
  startedAt: string,
  error: unknown
): DoctorRunResult => {
  const finishedAtMs = now()

  return doctorRunResultSchema.parse({
    mode,
    verdict: "red",
    internalFailure: true,
    checks: [],
    startedAt,
    finishedAt: new Date(finishedAtMs).toISOString(),
    durationMs: Math.max(0, finishedAtMs - startedAtMs),
    failure: {
      code: "ENGINE_FAILURE",
      message: toErrorMessage(error),
    },
  })
}

/**
 * Executes doctor checks using phase ordering with per-phase parallelism and lock-key
 * serialization so independent checks stay fast while mutating checks remain safe.
 */
export const runDoctorEngine = async (input: RunDoctorEngineInput): Promise<DoctorRunResult> => {
  const now = input.now ?? Date.now
  const startedAtMs = now()
  const startedAt = new Date(startedAtMs).toISOString()

  try {
    const registry = createDoctorCheckRegistry(input.checks)
    const eligibleChecks = getEligibleChecks(registry, input.mode)
    const phases = groupChecksByPhase(eligibleChecks)
    const serializer = createDoctorLockSerializer()
    const results: DoctorCheckResult[] = []

    for (const phaseEntry of phases) {
      const phaseResults = await Promise.all(
        phaseEntry.checks.map((check) => {
          const run = async (): Promise<DoctorCheckResult> => executeCheck(check, input.mode, now)

          if (typeof check.lockKey === "string" && check.lockKey.trim().length > 0) {
            return serializer.runWithKey(check.lockKey, run)
          }

          return run()
        })
      )

      results.push(...phaseResults)
    }

    const finishedAtMs = now()

    return doctorRunResultSchema.parse({
      mode: input.mode,
      verdict: mapDoctorRunVerdict(results, false),
      internalFailure: false,
      checks: results,
      startedAt,
      finishedAt: new Date(finishedAtMs).toISOString(),
      durationMs: Math.max(0, finishedAtMs - startedAtMs),
    })
  } catch (error) {
    return createInternalFailureResult(input.mode, now, startedAtMs, startedAt, error)
  }
}
