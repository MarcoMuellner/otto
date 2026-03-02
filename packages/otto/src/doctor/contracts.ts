import { z } from "zod"

import type { DoctorMode } from "../cli/command.js"

export const doctorSeveritySchema = z.enum(["ok", "warning", "error"])

export const doctorVerdictSchema = z.enum(["green", "yellow", "red"])

export const doctorEvidenceSchema = z.object({
  code: z.string().trim().min(1),
  message: z.string().trim().min(1),
  details: z.record(z.string(), z.unknown()).optional(),
})

export const doctorCheckTierSchema = z.enum(["fast", "deep"])

export const doctorCheckOutputSchema = z.object({
  severity: doctorSeveritySchema,
  summary: z.string().trim().min(1),
  evidence: z.array(doctorEvidenceSchema).default([]),
})

export const doctorCheckResultSchema = z.object({
  id: z.string().trim().min(1),
  phase: z.string().trim().min(1),
  tier: doctorCheckTierSchema,
  severity: doctorSeveritySchema,
  summary: z.string().trim().min(1),
  evidence: z.array(doctorEvidenceSchema),
  durationMs: z.number().int().min(0),
  timedOut: z.boolean(),
})

export const doctorRunResultSchema = z.object({
  mode: z.enum(["fast", "deep"] as const satisfies readonly DoctorMode[]),
  verdict: doctorVerdictSchema,
  internalFailure: z.boolean(),
  checks: z.array(doctorCheckResultSchema),
  failure: doctorEvidenceSchema.optional(),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime(),
  durationMs: z.number().int().min(0),
})

export type DoctorSeverity = z.infer<typeof doctorSeveritySchema>
export type DoctorVerdict = z.infer<typeof doctorVerdictSchema>
export type DoctorEvidence = z.infer<typeof doctorEvidenceSchema>
export type DoctorCheckTier = z.infer<typeof doctorCheckTierSchema>
export type DoctorCheckOutput = z.infer<typeof doctorCheckOutputSchema>
export type DoctorCheckResult = z.infer<typeof doctorCheckResultSchema>
export type DoctorRunResult = z.infer<typeof doctorRunResultSchema>

export type DoctorCheckContext = {
  mode: DoctorMode
}

export type DoctorCheckDefinition = {
  id: string
  phase: string
  tier: DoctorCheckTier
  timeoutMs?: number
  lockKey?: string
  run: (context: DoctorCheckContext) => Promise<DoctorCheckOutput>
}

/**
 * Validates and freezes check definitions up-front so scheduler behavior remains deterministic
 * even as more checks and phases are added over time.
 *
 * @param checks Candidate check definitions.
 * @returns Copy of checks preserving declaration order with validated identifiers.
 */
export const createDoctorCheckRegistry = (
  checks: readonly DoctorCheckDefinition[]
): DoctorCheckDefinition[] => {
  const seenIds = new Set<string>()

  for (const check of checks) {
    const id = check.id.trim()
    const phase = check.phase.trim()

    if (id.length === 0) {
      throw new Error("Doctor checks must define a non-empty id")
    }

    if (phase.length === 0) {
      throw new Error(`Doctor check '${check.id}' must define a non-empty phase`)
    }

    if (seenIds.has(id)) {
      throw new Error(`Doctor check ids must be unique. Duplicate id: '${id}'`)
    }

    seenIds.add(id)
  }

  return checks.map((check) => ({ ...check }))
}
