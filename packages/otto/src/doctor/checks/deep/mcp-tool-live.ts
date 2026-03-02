import type { DoctorCheckDefinition, DoctorCheckOutput, DoctorSeverity } from "../../contracts.js"
import { createDoctorLockSerializer } from "../../locks.js"
import { evaluateDoctorProbeGate } from "../../probes/registry.js"
import { executeDoctorLiveProbe, type DoctorLiveProbeDefinition } from "../../probes/executor.js"
import { createMcpToolLiveProbes } from "../../probes/mcp-tool.js"

type DeepMcpToolLiveDependencies = {
  now?: () => number
  createProbes?: () => Promise<DoctorLiveProbeDefinition[]>
  executeProbe?: (probe: DoctorLiveProbeDefinition) => Promise<{
    probeId: string
    integrationId: string
    severity: DoctorSeverity
    summary: string
    skipped: boolean
    durationMs: number
    evidence: DoctorCheckOutput["evidence"]
  }>
}

const reduceSeverity = (current: DoctorSeverity, candidate: DoctorSeverity): DoctorSeverity => {
  if (current === "error" || candidate === "error") {
    return "error"
  }

  if (current === "warning" || candidate === "warning") {
    return "warning"
  }

  return "ok"
}

/**
 * Executes live MCP/tool integration probes in deep mode so operators can validate active
 * extension integrations with deterministic evidence and per-integration lock safety.
 */
export const createDeepMcpToolLiveCheck = (
  dependencies: DeepMcpToolLiveDependencies = {}
): DoctorCheckDefinition => {
  const now = dependencies.now ?? Date.now
  const createProbes = dependencies.createProbes ?? createMcpToolLiveProbes
  const executeProbe =
    dependencies.executeProbe ?? ((probe) => executeDoctorLiveProbe(probe, { now }))

  return {
    id: "deep.mcp-tool.live",
    phase: "deep.integrations",
    tier: "deep",
    timeoutMs: 45_000,
    run: async (): Promise<DoctorCheckOutput> => {
      const probes = await createProbes()

      if (probes.length === 0) {
        return {
          severity: "ok",
          summary: "No enabled MCP/tool integrations require deep live probes",
          evidence: [
            {
              code: "DEEP_MCP_TOOL_PROBES_SKIPPED",
              message: "No enabled integration probes were registered",
            },
          ],
        }
      }

      const serializer = createDoctorLockSerializer()

      const results = await Promise.all(
        probes.map(async (probe) => {
          const gate = evaluateDoctorProbeGate(probe)
          if (!gate.allowed) {
            return {
              probeId: probe.id,
              integrationId: probe.integrationId,
              severity: "warning" as const,
              summary: `Probe '${probe.id}' skipped by cleanup safety gate`,
              skipped: true,
              durationMs: 0,
              evidence: [
                {
                  code: gate.skipReason.code,
                  message: gate.skipReason.message,
                  details: gate.skipReason.details,
                },
              ],
            }
          }

          const runProbe = async () => await executeProbe(probe)
          if (probe.lockKey && probe.lockKey.trim().length > 0) {
            return await serializer.runWithKey(probe.lockKey, runProbe)
          }

          return await runProbe()
        })
      )

      const evidence: DoctorCheckOutput["evidence"] = []
      let severity: DoctorSeverity = "ok"

      for (const result of results) {
        severity = reduceSeverity(severity, result.severity)

        evidence.push({
          code: result.skipped
            ? "DEEP_MCP_TOOL_PROBE_SKIPPED"
            : result.severity === "error"
              ? "DEEP_MCP_TOOL_PROBE_FAILED"
              : "DEEP_MCP_TOOL_PROBE_OK",
          message: result.summary,
          details: {
            probeId: result.probeId,
            integrationId: result.integrationId,
            durationMs: result.durationMs,
            severity: result.severity,
            skipped: result.skipped,
          },
        })
        evidence.push(...result.evidence)
      }

      if (severity === "error") {
        return {
          severity,
          summary: "One or more deep MCP/tool live probes failed",
          evidence,
        }
      }

      if (severity === "warning") {
        return {
          severity,
          summary: "Deep MCP/tool live probes completed with warnings",
          evidence,
        }
      }

      return {
        severity,
        summary: "Deep MCP/tool live probes completed successfully",
        evidence,
      }
    },
  }
}
