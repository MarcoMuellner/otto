import { describe, expect, it } from "vitest"

import { aggregateEodEvidenceBundle } from "../../src/scheduler/eod-learning/evidence-aggregation.js"

describe("eod-learning evidence aggregation", () => {
  it("aggregates mixed-lane signals into a deterministic traceable bundle", () => {
    // Arrange
    const result = aggregateEodEvidenceBundle({
      windowStartedAt: 1_000,
      windowEndedAt: 2_000,
      taskAudit: [
        {
          id: "task-2",
          taskId: "job-42",
          action: "update",
          lane: "scheduled",
          actor: "scheduler",
          beforeJson: null,
          afterJson: null,
          metadataJson: '{"reason":"nightly"}',
          createdAt: 1_350,
        },
      ],
      commandAudit: [
        {
          id: "command-1",
          command: "list_tasks",
          lane: "interactive",
          status: "success",
          errorMessage: null,
          metadataJson: "{bad-json",
          createdAt: 1_600,
        },
      ],
      jobRuns: [
        {
          runId: "run-5",
          jobId: "job-digest",
          jobType: "daily_digest",
          startedAt: 1_500,
          finishedAt: 1_520,
          status: "success",
          errorCode: null,
          errorMessage: null,
          resultJson: '{"summary":"ok"}',
        },
      ],
      interactiveContextEvents: [
        {
          id: "ctx-2",
          sourceSessionId: "sess-1",
          outboundMessageId: "msg-2",
          sourceLane: "scheduled",
          sourceKind: "watchdog_alert",
          sourceRef: "watchdog:abc",
          content: "watchdog queued",
          deliveryStatus: "queued",
          deliveryStatusDetail: "enqueued",
          errorMessage: null,
          createdAt: 1_700,
          updatedAt: 1_700,
        },
      ],
    })

    // Assert
    expect(result.evidence.map((entry) => entry.id)).toEqual([
      "interactive_context:ctx-2",
      "command_audit:command-1",
      "job_run:run-5",
      "task_audit:task-2",
    ])
    expect(result.evidence[0]?.trace.reference).toBe("interactive_context_events:ctx-2")
    expect(result.evidence[1]?.trace.reference).toBe("command_audit_log:command-1")
    expect(result.evidence[2]?.trace.reference).toBe("job_runs:run-5")
    expect(result.evidence[3]?.trace.reference).toBe("task_audit_log:task-2")
    expect(result.independentSignalCount).toBe(4)
  })

  it("deduplicates repeated source rows deterministically", () => {
    // Arrange
    const result = aggregateEodEvidenceBundle({
      windowStartedAt: 1_000,
      windowEndedAt: 2_000,
      taskAudit: [
        {
          id: "task-dup",
          taskId: "job-1",
          action: "update",
          lane: "scheduled",
          actor: "scheduler",
          beforeJson: null,
          afterJson: null,
          metadataJson: null,
          createdAt: 1_500,
        },
        {
          id: "task-dup",
          taskId: "job-1",
          action: "update",
          lane: "scheduled",
          actor: "scheduler",
          beforeJson: null,
          afterJson: null,
          metadataJson: null,
          createdAt: 1_300,
        },
      ],
      commandAudit: [],
      jobRuns: [],
      interactiveContextEvents: [],
    })

    // Assert
    expect(result.evidence).toHaveLength(1)
    expect(result.evidence[0]?.id).toBe("task_audit:task-dup")
    expect(result.evidence[0]?.occurredAt).toBe(1_500)
  })

  it("builds deterministic grouped signal summaries", () => {
    // Arrange
    const result = aggregateEodEvidenceBundle({
      windowStartedAt: 1_000,
      windowEndedAt: 2_000,
      taskAudit: [
        {
          id: "task-1",
          taskId: "job-1",
          action: "create",
          lane: "interactive",
          actor: "user",
          beforeJson: null,
          afterJson: null,
          metadataJson: null,
          createdAt: 1_100,
        },
      ],
      commandAudit: [
        {
          id: "command-1",
          command: "create_task",
          lane: "interactive",
          status: "success",
          errorMessage: null,
          metadataJson: null,
          createdAt: 1_120,
        },
      ],
      jobRuns: [
        {
          runId: "run-1",
          jobId: "job-1",
          jobType: "watchdog",
          startedAt: 1_140,
          finishedAt: 1_145,
          status: "failed",
          errorCode: "E_TIMEOUT",
          errorMessage: "timed out",
          resultJson: null,
        },
      ],
      interactiveContextEvents: [
        {
          id: "ctx-1",
          sourceSessionId: "sess-1",
          outboundMessageId: "msg-1",
          sourceLane: "scheduled",
          sourceKind: "background_lifecycle",
          sourceRef: null,
          content: "background update",
          deliveryStatus: "sent",
          deliveryStatusDetail: null,
          errorMessage: null,
          createdAt: 1_160,
          updatedAt: 1_160,
        },
      ],
    })

    // Assert
    expect(result.groupedSignals.map((group) => group.signalGroup)).toEqual([
      "commands",
      "interactive_context",
      "jobs",
      "tasks",
    ])
    expect(result.groupedSignals.map((group) => group.evidenceCount)).toEqual([1, 1, 1, 1])
    expect(result.independentSignalCount).toBe(4)
  })

  it("returns an empty bundle for empty or noisy windows without throwing", () => {
    // Arrange
    const result = aggregateEodEvidenceBundle({
      windowStartedAt: 2_000,
      windowEndedAt: 1_000,
      taskAudit: [
        {
          id: "task-outside",
          taskId: "job-outside",
          action: "update",
          lane: "scheduled",
          actor: "scheduler",
          beforeJson: null,
          afterJson: null,
          metadataJson: null,
          createdAt: 900,
        },
      ],
      commandAudit: [],
      jobRuns: [],
      interactiveContextEvents: [],
    })

    // Assert
    expect(result.windowStartedAt).toBe(1_000)
    expect(result.windowEndedAt).toBe(2_000)
    expect(result.evidence).toEqual([])
    expect(result.groupedSignals).toEqual([])
    expect(result.independentSignalCount).toBe(0)
  })
})
