import {
  doctorProbeContractSchema,
  doctorProbeSkipReasonSchema,
  type DoctorProbeDefinition,
  type DoctorProbeSkipReason,
} from "./contracts.js"

export type DoctorProbeGateDecision =
  | {
      allowed: true
      skipReason: null
    }
  | {
      allowed: false
      skipReason: DoctorProbeSkipReason
    }

/**
 * Validates and freezes probe definitions so deep integration checks can execute with a
 * deterministic contract surface as new probes are added.
 */
export const createDoctorProbeRegistry = (
  probes: readonly DoctorProbeDefinition[]
): DoctorProbeDefinition[] => {
  const seenIds = new Set<string>()
  const parsedProbes: DoctorProbeDefinition[] = []

  for (const probe of probes) {
    const parsed = doctorProbeContractSchema.parse(probe)
    if (seenIds.has(parsed.id)) {
      throw new Error(`Doctor probe ids must be unique. Duplicate id: '${parsed.id}'`)
    }

    seenIds.add(parsed.id)
    parsedProbes.push(parsed)
  }

  return parsedProbes
}

/**
 * Applies pre-execution gating for probe safety contracts so mutating probes only run when
 * cleanup behavior is guaranteed.
 */
export const evaluateDoctorProbeGate = (probe: DoctorProbeDefinition): DoctorProbeGateDecision => {
  const parsed = doctorProbeContractSchema.parse(probe)

  if (parsed.cleanupRequired && !parsed.cleanupGuaranteed) {
    const skipReason = doctorProbeSkipReasonSchema.parse({
      code: "PROBE_SKIPPED_CLEANUP_NOT_GUARANTEED",
      message: `Probe '${parsed.id}' requires cleanup but does not guarantee cleanup completion`,
      details: {
        probeId: parsed.id,
        mutating: parsed.mutating,
        cleanupRequired: parsed.cleanupRequired,
        cleanupGuaranteed: parsed.cleanupGuaranteed,
      },
    })

    return {
      allowed: false,
      skipReason,
    }
  }

  return {
    allowed: true,
    skipReason: null,
  }
}
