import { z } from "zod"

export const doctorProbeContractSchema = z.object({
  id: z.string().trim().min(1),
  mutating: z.boolean(),
  cleanupRequired: z.boolean(),
  cleanupGuaranteed: z.boolean(),
  lockKey: z.string().trim().min(1).optional(),
})

export const doctorProbeSkipReasonSchema = z.object({
  code: z.string().trim().min(1),
  message: z.string().trim().min(1),
  details: z.record(z.string(), z.unknown()).optional(),
})

export type DoctorProbeContract = z.infer<typeof doctorProbeContractSchema>
export type DoctorProbeSkipReason = z.infer<typeof doctorProbeSkipReasonSchema>

/**
 * Probe contracts describe live integration probe safety behavior so deep checks can reason
 * about mutating side effects and cleanup guarantees before executing probe logic.
 */
export type DoctorProbeDefinition = DoctorProbeContract
