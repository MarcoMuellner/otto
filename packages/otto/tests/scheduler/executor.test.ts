import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"

import { INTERACTIVE_BACKGROUND_ONESHOT_JOB_TYPE } from "../../src/api-services/interactive-background-jobs.js"
import {
  createCommandAuditRepository,
  createEodLearningRepository,
  createInteractiveContextEventsRepository,
  createJobsRepository,
  createJobRunSessionsRepository,
  createOutboundMessagesRepository,
  createSessionBindingsRepository,
  createTaskAuditRepository,
  openPersistenceDatabase,
} from "../../src/persistence/index.js"
import { createNonInteractiveContextCaptureService } from "../../src/runtime/non-interactive-context-capture.js"
import {
  EOD_LEARNING_PROFILE_ID,
  EOD_LEARNING_TASK_ID,
  EOD_LEARNING_TASK_TYPE,
} from "../../src/scheduler/eod-learning.js"
import { createTaskExecutionEngine } from "../../src/scheduler/executor.js"

const TEMP_PREFIX = path.join(tmpdir(), "otto-scheduler-executor-")
const cleanupPaths: string[] = []

afterEach(async () => {
  await Promise.all(
    cleanupPaths.splice(0).map(async (directory) => rm(directory, { recursive: true, force: true }))
  )
})

const createLoggerStub = () => {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
}

const writeMinimalTaskConfig = async (ottoHome: string): Promise<void> => {
  const taskConfigDirectory = path.join(ottoHome, "task-config")
  await mkdir(path.join(taskConfigDirectory, "profiles"), { recursive: true })
  await writeFile(
    path.join(taskConfigDirectory, "base.jsonc"),
    JSON.stringify(
      {
        version: 1,
        base: {
          opencode: {
            agent: {
              assistant: {
                prompt: "Execute the scheduled task and return strict JSON.",
              },
            },
          },
        },
        lanes: {
          scheduled: {
            opencode: {
              agent: {
                assistant: {
                  tools: {
                    list_tasks: true,
                    check_task_failures: true,
                  },
                },
              },
            },
          },
        },
      },
      null,
      2
    ),
    "utf8"
  )

  await writeFile(
    path.join(taskConfigDirectory, "profiles", "general-reminder.jsonc"),
    JSON.stringify(
      {
        version: 1,
        id: "general-reminder",
        laneOverrides: {
          scheduled: {
            opencode: {},
          },
        },
      },
      null,
      2
    ),
    "utf8"
  )
}

const writeMinimalPromptWorkspace = async (
  ottoHome: string,
  input: {
    userMapping?: Record<string, unknown>
  } = {}
): Promise<void> => {
  const systemPromptsDirectory = path.join(ottoHome, "system-prompts")
  const userPromptsDirectory = path.join(ottoHome, "prompts")

  await mkdir(path.join(systemPromptsDirectory, "layers"), { recursive: true })
  await mkdir(path.join(systemPromptsDirectory, "task-profiles"), { recursive: true })
  await mkdir(path.join(userPromptsDirectory, "layers"), { recursive: true })
  await mkdir(path.join(userPromptsDirectory, "task-profiles"), { recursive: true })

  await writeFile(
    path.join(systemPromptsDirectory, "mapping.jsonc"),
    JSON.stringify(
      {
        version: 1,
        selectors: {
          interactive: {
            default: "interactive-cli",
            media: {
              chatapps: "interactive-chatapps",
              web: "interactive-web",
              cli: "interactive-cli",
            },
          },
          scheduled: {
            default: "scheduled-cli",
            media: {
              chatapps: "scheduled-chatapps",
              web: "scheduled-web",
              cli: "scheduled-cli",
            },
          },
          background: {
            default: "background-cli",
            media: {
              chatapps: "background-chatapps",
              web: "background-web",
              cli: "background-cli",
            },
          },
          watchdog: {
            default: "watchdog-default",
            media: {},
          },
        },
        routes: {
          "interactive-chatapps": {
            layers: {
              "core-persona": { source: "system", path: "layers/core.md" },
            },
          },
          "interactive-web": {
            layers: {
              "core-persona": { source: "system", path: "layers/core.md" },
            },
          },
          "interactive-cli": {
            layers: {
              "core-persona": { source: "system", path: "layers/core.md" },
            },
          },
          "scheduled-chatapps": {
            layers: {
              "core-persona": { source: "system", path: "layers/core.md" },
              surface: { source: "system", path: "layers/surface-scheduled.md" },
              media: { source: "system", path: "layers/media-chatapps.md" },
            },
          },
          "scheduled-web": {
            layers: {
              "core-persona": { source: "system", path: "layers/core.md" },
              surface: { source: "system", path: "layers/surface-scheduled.md" },
              media: { source: "system", path: "layers/media-web.md" },
            },
          },
          "scheduled-cli": {
            layers: {
              "core-persona": { source: "system", path: "layers/core.md" },
              surface: { source: "system", path: "layers/surface-scheduled.md" },
              media: { source: "system", path: "layers/media-cli.md" },
            },
          },
          "background-chatapps": {
            layers: {
              "core-persona": { source: "system", path: "layers/core.md" },
              surface: { source: "system", path: "layers/surface-background.md" },
              media: { source: "system", path: "layers/media-chatapps.md" },
            },
          },
          "background-web": {
            layers: {
              "core-persona": { source: "system", path: "layers/core.md" },
              surface: { source: "system", path: "layers/surface-background.md" },
              media: { source: "system", path: "layers/media-web.md" },
            },
          },
          "background-cli": {
            layers: {
              "core-persona": { source: "system", path: "layers/core.md" },
              surface: { source: "system", path: "layers/surface-background.md" },
              media: { source: "system", path: "layers/media-cli.md" },
            },
          },
          "watchdog-default": {
            layers: {
              "core-persona": { source: "system", path: "layers/watchdog.md" },
              surface: { source: "system", path: "layers/surface-watchdog.md" },
            },
          },
        },
      },
      null,
      2
    ),
    "utf8"
  )

  await writeFile(
    path.join(userPromptsDirectory, "mapping.jsonc"),
    JSON.stringify(input.userMapping ?? { version: 1, selectors: {}, routes: {} }, null, 2),
    "utf8"
  )

  await writeFile(
    path.join(systemPromptsDirectory, "layers", "core.md"),
    "# Core\nSystem core\n",
    "utf8"
  )
  await writeFile(
    path.join(systemPromptsDirectory, "layers", "surface-scheduled.md"),
    "## Surface\nScheduled surface\n",
    "utf8"
  )
  await writeFile(
    path.join(systemPromptsDirectory, "layers", "surface-background.md"),
    "## Surface\nBackground surface\n",
    "utf8"
  )
  await writeFile(
    path.join(systemPromptsDirectory, "layers", "media-cli.md"),
    "## Media\nCLI media\n",
    "utf8"
  )
  await writeFile(
    path.join(systemPromptsDirectory, "layers", "media-web.md"),
    "## Media\nWeb media\n",
    "utf8"
  )
  await writeFile(
    path.join(systemPromptsDirectory, "layers", "media-chatapps.md"),
    "## Media\nChatapps media\n",
    "utf8"
  )
  await writeFile(
    path.join(systemPromptsDirectory, "layers", "watchdog.md"),
    "# Watchdog\nSystem watchdog\n",
    "utf8"
  )
  await writeFile(
    path.join(systemPromptsDirectory, "layers", "surface-watchdog.md"),
    "## Surface\nWatchdog surface\n",
    "utf8"
  )
  await writeFile(
    path.join(userPromptsDirectory, "layers", "surface-watchdog.md"),
    "## Surface\nUser watchdog surface\n",
    "utf8"
  )

  await writeFile(
    path.join(systemPromptsDirectory, "task-profiles", "general-reminder.md"),
    "## Task Profile\nSystem general reminder profile\n",
    "utf8"
  )
  await writeFile(
    path.join(userPromptsDirectory, "task-profiles", "general-reminder.md"),
    "## Task Profile\nUser general reminder profile\n",
    "utf8"
  )
}

describe("task execution engine", () => {
  it("executes recurring due task and persists structured success result", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const db = openPersistenceDatabase({ dbPath: path.join(tempRoot, "state.db") })
    const jobsRepository = createJobsRepository(db)
    const jobRunSessionsRepository = createJobRunSessionsRepository(db)
    const sessionBindingsRepository = createSessionBindingsRepository(db)
    const outboundMessagesRepository = createOutboundMessagesRepository(db)
    await writeMinimalTaskConfig(tempRoot)
    await writeMinimalPromptWorkspace(tempRoot)

    jobsRepository.createTask({
      id: "job-recurring-1",
      type: "general-reminder",
      status: "idle",
      scheduleType: "recurring",
      profileId: null,
      modelRef: null,
      runAt: null,
      cadenceMinutes: 30,
      payload: JSON.stringify({ message: "Call Alice" }),
      lastRunAt: null,
      nextRunAt: 1_000,
      terminalState: null,
      terminalReason: null,
      lockToken: null,
      lockExpiresAt: null,
      createdAt: 100,
      updatedAt: 100,
    })

    const claimed = jobsRepository.claimDue(1_000, 10, "lock-1", 60_000, 1_000)[0]
    if (!claimed) {
      throw new Error("Expected due task claim")
    }

    const promptSession = vi.fn(async () =>
      JSON.stringify({
        status: "success",
        summary: "Reminder handled",
        errors: [],
      })
    )

    const logger = createLoggerStub()
    const engine = createTaskExecutionEngine({
      logger,
      ottoHome: tempRoot,
      jobsRepository,
      jobRunSessionsRepository,
      sessionBindingsRepository,
      outboundMessagesRepository,
      sessionGateway: {
        ensureSession: async () => "session-1",
        promptSession,
      },
      defaultWatchdogChatId: null,
      userProfileRepository: {
        get: () => null,
        setLastDigestAt: () => {},
      },
      now: () => 2_000,
    })

    // Act
    await engine.executeClaimedJob(claimed)

    // Assert
    const runs = jobsRepository.listRunsByJobId("job-recurring-1")
    expect(runs[0]?.status).toBe("success")
    expect(runs[0]?.resultJson).toContain("Reminder handled")

    const task = jobsRepository.getById("job-recurring-1")
    expect(task?.status).toBe("idle")
    expect(task?.lockToken).toBeNull()
    expect(task?.nextRunAt).toBe(2_000 + 30 * 60_000)
    expect(promptSession).toHaveBeenCalledWith(
      "session-1",
      expect.stringContaining("Execute this scheduled Otto task now."),
      expect.objectContaining({
        systemPrompt: expect.stringContaining("## Surface\nScheduled surface"),
      })
    )

    db.close()
  })

  it("applies optional task-profile prompt layer for scheduled jobs", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const db = openPersistenceDatabase({ dbPath: path.join(tempRoot, "state.db") })
    const jobsRepository = createJobsRepository(db)
    const jobRunSessionsRepository = createJobRunSessionsRepository(db)
    const sessionBindingsRepository = createSessionBindingsRepository(db)
    const outboundMessagesRepository = createOutboundMessagesRepository(db)
    await writeMinimalTaskConfig(tempRoot)
    await writeMinimalPromptWorkspace(tempRoot)

    jobsRepository.createTask({
      id: "job-recurring-profile-1",
      type: "general-reminder",
      status: "idle",
      scheduleType: "recurring",
      profileId: "general-reminder",
      modelRef: null,
      runAt: null,
      cadenceMinutes: 30,
      payload: JSON.stringify({ message: "Call Alice" }),
      lastRunAt: null,
      nextRunAt: 1_000,
      terminalState: null,
      terminalReason: null,
      lockToken: null,
      lockExpiresAt: null,
      createdAt: 100,
      updatedAt: 100,
    })

    const claimed = jobsRepository.claimDue(1_000, 10, "lock-profile-1", 60_000, 1_000)[0]
    if (!claimed) {
      throw new Error("Expected due task claim")
    }

    const promptSession = vi.fn(async () =>
      JSON.stringify({
        status: "success",
        summary: "Reminder handled",
        errors: [],
      })
    )

    const logger = createLoggerStub()
    const engine = createTaskExecutionEngine({
      logger,
      ottoHome: tempRoot,
      jobsRepository,
      jobRunSessionsRepository,
      sessionBindingsRepository,
      outboundMessagesRepository,
      sessionGateway: {
        ensureSession: async () => "session-profile-1",
        promptSession,
      },
      defaultWatchdogChatId: 777,
      userProfileRepository: {
        get: () => null,
        setLastDigestAt: () => {},
      },
      now: () => 2_000,
    })

    // Act
    await engine.executeClaimedJob(claimed)

    // Assert
    expect(promptSession).toHaveBeenCalledWith(
      "session-profile-1",
      expect.any(String),
      expect.objectContaining({
        systemPrompt: expect.stringContaining("## Task Profile\nUser general reminder profile"),
      })
    )

    db.close()
  })

  it("falls back to base scheduled config when EOD profile file is missing", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const db = openPersistenceDatabase({ dbPath: path.join(tempRoot, "state.db") })
    const jobsRepository = createJobsRepository(db)
    const jobRunSessionsRepository = createJobRunSessionsRepository(db)
    const sessionBindingsRepository = createSessionBindingsRepository(db)
    const outboundMessagesRepository = createOutboundMessagesRepository(db)
    await writeMinimalTaskConfig(tempRoot)
    await writeMinimalPromptWorkspace(tempRoot)

    jobsRepository.createTask({
      id: EOD_LEARNING_TASK_ID,
      type: EOD_LEARNING_TASK_TYPE,
      status: "idle",
      scheduleType: "recurring",
      profileId: EOD_LEARNING_PROFILE_ID,
      modelRef: null,
      runAt: null,
      cadenceMinutes: 24 * 60,
      payload: JSON.stringify({ timezone: "Europe/Vienna" }),
      lastRunAt: null,
      nextRunAt: 1_000,
      terminalState: null,
      terminalReason: null,
      lockToken: null,
      lockExpiresAt: null,
      createdAt: 100,
      updatedAt: 100,
    })

    jobsRepository.createTask({
      id: "seed-task",
      type: "general-reminder",
      status: "idle",
      scheduleType: "oneshot",
      profileId: null,
      modelRef: null,
      runAt: 20_000,
      cadenceMinutes: null,
      payload: JSON.stringify({ message: "seed" }),
      lastRunAt: null,
      nextRunAt: 20_000,
      terminalState: null,
      terminalReason: null,
      lockToken: null,
      lockExpiresAt: null,
      createdAt: 100,
      updatedAt: 100,
    })

    const claimed = jobsRepository.claimDue(1_000, 10, "lock-eod-1", 60_000, 1_000)[0]
    if (!claimed) {
      throw new Error("Expected due task claim")
    }

    const promptSession = vi.fn(async () =>
      JSON.stringify({
        status: "success",
        summary: "EOD handled",
        errors: [],
      })
    )

    const logger = createLoggerStub()
    const engine = createTaskExecutionEngine({
      logger,
      ottoHome: tempRoot,
      jobsRepository,
      jobRunSessionsRepository,
      sessionBindingsRepository,
      outboundMessagesRepository,
      sessionGateway: {
        ensureSession: async () => "session-eod-1",
        promptSession,
      },
      defaultWatchdogChatId: null,
      userProfileRepository: {
        get: () => null,
        setLastDigestAt: () => {},
      },
      now: () => 2_000,
    })

    // Act
    await engine.executeClaimedJob(claimed)

    // Assert
    const runs = jobsRepository.listRunsByJobId(EOD_LEARNING_TASK_ID)
    expect(runs[0]?.status).toBe("success")
    expect(promptSession).toHaveBeenCalledWith(
      "session-eod-1",
      expect.any(String),
      expect.objectContaining({
        systemPrompt: expect.stringContaining("## Surface\nScheduled surface"),
      })
    )
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: EOD_LEARNING_TASK_ID,
        profileId: EOD_LEARNING_PROFILE_ID,
      }),
      expect.stringContaining("falling back to base scheduled task config")
    )

    db.close()
  })

  it("persists EOD run artifacts and captures per-item apply failures", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const db = openPersistenceDatabase({ dbPath: path.join(tempRoot, "state.db") })
    const jobsRepository = createJobsRepository(db)
    const jobRunSessionsRepository = createJobRunSessionsRepository(db)
    const sessionBindingsRepository = createSessionBindingsRepository(db)
    const outboundMessagesRepository = createOutboundMessagesRepository(db)
    const taskAuditRepository = createTaskAuditRepository(db)
    const commandAuditRepository = createCommandAuditRepository(db)
    const interactiveContextEventsRepository = createInteractiveContextEventsRepository(db)
    const eodLearningRepository = createEodLearningRepository(db)
    await writeMinimalTaskConfig(tempRoot)
    await writeMinimalPromptWorkspace(tempRoot)

    jobsRepository.createTask({
      id: EOD_LEARNING_TASK_ID,
      type: EOD_LEARNING_TASK_TYPE,
      status: "idle",
      scheduleType: "recurring",
      profileId: EOD_LEARNING_PROFILE_ID,
      modelRef: null,
      runAt: null,
      cadenceMinutes: 24 * 60,
      payload: JSON.stringify({ timezone: "Europe/Vienna" }),
      lastRunAt: null,
      nextRunAt: 10_000,
      terminalState: null,
      terminalReason: null,
      lockToken: null,
      lockExpiresAt: null,
      createdAt: 100,
      updatedAt: 100,
    })

    jobsRepository.createTask({
      id: "task-alpha",
      type: "general-reminder",
      status: "idle",
      scheduleType: "oneshot",
      profileId: null,
      modelRef: null,
      runAt: 20_000,
      cadenceMinutes: null,
      payload: JSON.stringify({ message: "stub" }),
      lastRunAt: null,
      nextRunAt: 20_000,
      terminalState: null,
      terminalReason: null,
      lockToken: null,
      lockExpiresAt: null,
      createdAt: 100,
      updatedAt: 100,
    })

    taskAuditRepository.insert({
      id: "ta-1",
      taskId: "task-alpha",
      action: "update",
      lane: "scheduled",
      actor: "scheduler",
      beforeJson: null,
      afterJson: null,
      metadataJson: null,
      createdAt: 9_100,
    })
    commandAuditRepository.insert({
      id: "ca-1",
      command: "list_tasks",
      lane: "scheduled",
      status: "success",
      errorMessage: null,
      metadataJson: null,
      createdAt: 9_150,
    })

    const claimed = jobsRepository.claimDue(10_000, 10, "lock-eod-artifacts", 60_000, 10_000)[0]
    if (!claimed) {
      throw new Error("Expected due EOD task claim")
    }

    const promptSession = vi
      .fn()
      .mockResolvedValueOnce(
        JSON.stringify({
          candidates: [
            {
              title: "Conflicting candidate",
              confidence: 0.92,
              contradiction: true,
              expectedValue: 0.5,
              evidenceIds: ["task_audit:ta-1", "command_audit:ca-1"],
              rationale: "Signals conflict",
            },
            {
              title: "Apply candidate",
              confidence: 0.7,
              contradiction: false,
              expectedValue: 0.4,
              evidenceIds: ["task_audit:ta-1", "command_audit:ca-1"],
              rationale: "Stable medium confidence",
            },
            {
              title: "Low confidence candidate",
              confidence: 0.4,
              contradiction: false,
              expectedValue: 0.1,
              evidenceIds: ["task_audit:ta-1", "command_audit:ca-1"],
              rationale: "Weak signal",
            },
          ],
        })
      )
      .mockRejectedValueOnce(new Error("apply step failed"))
      .mockResolvedValueOnce(
        JSON.stringify({
          message: "fallback-friendly digest",
        })
      )

    const engine = createTaskExecutionEngine({
      logger: createLoggerStub(),
      ottoHome: tempRoot,
      jobsRepository,
      jobRunSessionsRepository,
      sessionBindingsRepository,
      outboundMessagesRepository,
      taskAuditRepository,
      commandAuditRepository,
      interactiveContextEventsRepository,
      eodLearningRepository,
      sessionGateway: {
        ensureSession: async () => "session-eod-artifacts",
        promptSession,
      },
      defaultWatchdogChatId: null,
      userProfileRepository: {
        get: () => null,
        setLastDigestAt: () => {},
      },
      now: () => 10_500,
    })

    // Act
    await engine.executeClaimedJob(claimed)

    // Assert
    const runs = jobsRepository.listRunsByJobId(EOD_LEARNING_TASK_ID)
    expect(runs[0]?.status).toBe("success")

    const eodRun = eodLearningRepository.listRecentRuns(1)[0]
    expect(eodRun?.status).toBe("success")
    const details = eodLearningRepository.getRunDetails(eodRun?.id ?? "")
    expect(details?.items).toHaveLength(3)

    const contradictionItem = details?.items.find(
      (entry) => entry.item.title === "Conflicting candidate"
    )
    expect(contradictionItem?.item.applyStatus).toBe("skipped")

    const failedApplyItem = details?.items.find((entry) => entry.item.title === "Apply candidate")
    expect(failedApplyItem?.item.applyStatus).toBe("failed")
    expect(failedApplyItem?.item.applyError).toContain("apply step failed")

    const lowConfidenceItem = details?.items.find(
      (entry) => entry.item.title === "Low confidence candidate"
    )
    expect(lowConfidenceItem?.item.applyStatus).toBe("candidate_only")
    expect(promptSession).toHaveBeenCalledTimes(3)

    db.close()
  })

  it("queues one EOD transparency digest after a successful run", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const db = openPersistenceDatabase({ dbPath: path.join(tempRoot, "state.db") })
    const jobsRepository = createJobsRepository(db)
    const jobRunSessionsRepository = createJobRunSessionsRepository(db)
    const sessionBindingsRepository = createSessionBindingsRepository(db)
    const outboundMessagesRepository = createOutboundMessagesRepository(db)
    const taskAuditRepository = createTaskAuditRepository(db)
    const commandAuditRepository = createCommandAuditRepository(db)
    const interactiveContextEventsRepository = createInteractiveContextEventsRepository(db)
    const eodLearningRepository = createEodLearningRepository(db)
    await writeMinimalTaskConfig(tempRoot)
    await writeMinimalPromptWorkspace(tempRoot)

    jobsRepository.createTask({
      id: EOD_LEARNING_TASK_ID,
      type: EOD_LEARNING_TASK_TYPE,
      status: "idle",
      scheduleType: "recurring",
      profileId: EOD_LEARNING_PROFILE_ID,
      modelRef: null,
      runAt: null,
      cadenceMinutes: 24 * 60,
      payload: JSON.stringify({ timezone: "Europe/Vienna" }),
      lastRunAt: null,
      nextRunAt: 10_000,
      terminalState: null,
      terminalReason: null,
      lockToken: null,
      lockExpiresAt: null,
      createdAt: 100,
      updatedAt: 100,
    })

    jobsRepository.createTask({
      id: "task-alpha",
      type: "general-reminder",
      status: "idle",
      scheduleType: "oneshot",
      profileId: null,
      modelRef: null,
      runAt: 20_000,
      cadenceMinutes: null,
      payload: JSON.stringify({ message: "stub" }),
      lastRunAt: null,
      nextRunAt: 20_000,
      terminalState: null,
      terminalReason: null,
      lockToken: null,
      lockExpiresAt: null,
      createdAt: 100,
      updatedAt: 100,
    })

    taskAuditRepository.insert({
      id: "ta-digest-1",
      taskId: "task-alpha",
      action: "update",
      lane: "scheduled",
      actor: "scheduler",
      beforeJson: null,
      afterJson: null,
      metadataJson: null,
      createdAt: 9_100,
    })
    commandAuditRepository.insert({
      id: "ca-digest-1",
      command: "list_tasks",
      lane: "scheduled",
      status: "success",
      errorMessage: null,
      metadataJson: null,
      createdAt: 9_150,
    })

    const claimed = jobsRepository.claimDue(10_000, 10, "lock-eod-digest-1", 60_000, 10_000)[0]
    if (!claimed) {
      throw new Error("Expected due EOD task claim")
    }

    const promptSession = vi
      .fn()
      .mockResolvedValueOnce(
        JSON.stringify({
          candidates: [
            {
              title: "Digest candidate",
              confidence: 0.4,
              contradiction: false,
              expectedValue: 0.2,
              evidenceIds: ["task_audit:ta-digest-1", "command_audit:ca-digest-1"],
              rationale: "Low confidence candidate",
            },
          ],
        })
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          message: "LLM digest message",
        })
      )

    const engine = createTaskExecutionEngine({
      logger: createLoggerStub(),
      ottoHome: tempRoot,
      jobsRepository,
      jobRunSessionsRepository,
      sessionBindingsRepository,
      outboundMessagesRepository,
      taskAuditRepository,
      commandAuditRepository,
      interactiveContextEventsRepository,
      eodLearningRepository,
      sessionGateway: {
        ensureSession: async () => "session-eod-digest-1",
        promptSession,
      },
      defaultWatchdogChatId: 777,
      userProfileRepository: {
        get: () => null,
        setLastDigestAt: () => {},
      },
      now: () => 10_500,
    })

    // Act
    await engine.executeClaimedJob(claimed)

    // Assert
    const runs = jobsRepository.listRunsByJobId(EOD_LEARNING_TASK_ID)
    expect(runs[0]?.status).toBe("success")

    const queued = outboundMessagesRepository.listDue(20_000)
    expect(queued).toHaveLength(1)
    expect(queued[0]?.chatId).toBe(777)
    expect(queued[0]?.dedupeKey).toContain("eod-learning-digest:")
    expect(queued[0]?.content).toBe("LLM digest message")

    db.close()
  })

  it("does not fail EOD run when digest enqueue fails", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const db = openPersistenceDatabase({ dbPath: path.join(tempRoot, "state.db") })
    const jobsRepository = createJobsRepository(db)
    const jobRunSessionsRepository = createJobRunSessionsRepository(db)
    const sessionBindingsRepository = createSessionBindingsRepository(db)
    const outboundMessagesRepository = createOutboundMessagesRepository(db)
    const taskAuditRepository = createTaskAuditRepository(db)
    const commandAuditRepository = createCommandAuditRepository(db)
    const interactiveContextEventsRepository = createInteractiveContextEventsRepository(db)
    const eodLearningRepository = createEodLearningRepository(db)
    await writeMinimalTaskConfig(tempRoot)
    await writeMinimalPromptWorkspace(tempRoot)

    jobsRepository.createTask({
      id: EOD_LEARNING_TASK_ID,
      type: EOD_LEARNING_TASK_TYPE,
      status: "idle",
      scheduleType: "recurring",
      profileId: EOD_LEARNING_PROFILE_ID,
      modelRef: null,
      runAt: null,
      cadenceMinutes: 24 * 60,
      payload: JSON.stringify({ timezone: "Europe/Vienna" }),
      lastRunAt: null,
      nextRunAt: 10_000,
      terminalState: null,
      terminalReason: null,
      lockToken: null,
      lockExpiresAt: null,
      createdAt: 100,
      updatedAt: 100,
    })

    jobsRepository.createTask({
      id: "task-alpha",
      type: "general-reminder",
      status: "idle",
      scheduleType: "oneshot",
      profileId: null,
      modelRef: null,
      runAt: 20_000,
      cadenceMinutes: null,
      payload: JSON.stringify({ message: "stub" }),
      lastRunAt: null,
      nextRunAt: 20_000,
      terminalState: null,
      terminalReason: null,
      lockToken: null,
      lockExpiresAt: null,
      createdAt: 100,
      updatedAt: 100,
    })

    taskAuditRepository.insert({
      id: "ta-digest-2",
      taskId: "task-alpha",
      action: "update",
      lane: "scheduled",
      actor: "scheduler",
      beforeJson: null,
      afterJson: null,
      metadataJson: null,
      createdAt: 9_100,
    })
    commandAuditRepository.insert({
      id: "ca-digest-2",
      command: "list_tasks",
      lane: "scheduled",
      status: "success",
      errorMessage: null,
      metadataJson: null,
      createdAt: 9_150,
    })

    const claimed = jobsRepository.claimDue(10_000, 10, "lock-eod-digest-2", 60_000, 10_000)[0]
    if (!claimed) {
      throw new Error("Expected due EOD task claim")
    }

    const promptSession = vi.fn().mockResolvedValueOnce(
      JSON.stringify({
        candidates: [
          {
            title: "Digest candidate",
            confidence: 0.4,
            contradiction: false,
            expectedValue: 0.2,
            evidenceIds: ["task_audit:ta-digest-2", "command_audit:ca-digest-2"],
            rationale: "Low confidence candidate",
          },
        ],
      })
    )

    const logger = createLoggerStub()
    vi.spyOn(outboundMessagesRepository, "enqueueOrIgnoreDedupe").mockImplementation(() => {
      throw new Error("telegram queue unavailable")
    })

    const engine = createTaskExecutionEngine({
      logger,
      ottoHome: tempRoot,
      jobsRepository,
      jobRunSessionsRepository,
      sessionBindingsRepository,
      outboundMessagesRepository,
      taskAuditRepository,
      commandAuditRepository,
      interactiveContextEventsRepository,
      eodLearningRepository,
      sessionGateway: {
        ensureSession: async () => "session-eod-digest-2",
        promptSession,
      },
      defaultWatchdogChatId: 777,
      userProfileRepository: {
        get: () => null,
        setLastDigestAt: () => {},
      },
      now: () => 10_500,
    })

    // Act
    await engine.executeClaimedJob(claimed)

    // Assert
    const runs = jobsRepository.listRunsByJobId(EOD_LEARNING_TASK_ID)
    expect(runs[0]?.status).toBe("success")

    const eodRun = eodLearningRepository.listRecentRuns(1)[0]
    expect(eodRun?.status).toBe("success")

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ error: "telegram queue unavailable" }),
      "Failed to enqueue EOD learning transparency digest"
    )

    db.close()
  })

  it("dedupes autonomous follow-up scheduling across adjacent EOD runs", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const db = openPersistenceDatabase({ dbPath: path.join(tempRoot, "state.db") })
    const jobsRepository = createJobsRepository(db)
    const jobRunSessionsRepository = createJobRunSessionsRepository(db)
    const sessionBindingsRepository = createSessionBindingsRepository(db)
    const outboundMessagesRepository = createOutboundMessagesRepository(db)
    const taskAuditRepository = createTaskAuditRepository(db)
    const commandAuditRepository = createCommandAuditRepository(db)
    const interactiveContextEventsRepository = createInteractiveContextEventsRepository(db)
    const eodLearningRepository = createEodLearningRepository(db)
    await writeMinimalTaskConfig(tempRoot)
    await writeMinimalPromptWorkspace(tempRoot)

    jobsRepository.createTask({
      id: EOD_LEARNING_TASK_ID,
      type: EOD_LEARNING_TASK_TYPE,
      status: "idle",
      scheduleType: "recurring",
      profileId: EOD_LEARNING_PROFILE_ID,
      modelRef: null,
      runAt: null,
      cadenceMinutes: 24 * 60,
      payload: JSON.stringify({ timezone: "Europe/Vienna" }),
      lastRunAt: null,
      nextRunAt: 10_000,
      terminalState: null,
      terminalReason: null,
      lockToken: null,
      lockExpiresAt: null,
      createdAt: 100,
      updatedAt: 100,
    })

    taskAuditRepository.insert({
      id: "ta-follow-up-1",
      taskId: EOD_LEARNING_TASK_ID,
      action: "update",
      lane: "scheduled",
      actor: "scheduler",
      beforeJson: null,
      afterJson: null,
      metadataJson: null,
      createdAt: 9_200,
    })
    commandAuditRepository.insert({
      id: "ca-follow-up-1",
      command: "list_tasks",
      lane: "scheduled",
      status: "success",
      errorMessage: null,
      metadataJson: null,
      createdAt: 9_250,
    })

    const promptSession = vi
      .fn()
      .mockResolvedValueOnce(
        JSON.stringify({
          candidates: [
            {
              title: "Reminder clarity",
              confidence: 0.9,
              contradiction: false,
              expectedValue: 0.7,
              evidenceIds: ["task_audit:ta-follow-up-1", "command_audit:ca-follow-up-1"],
              rationale: "Strong signals",
              followUpActions: [
                {
                  title: "Run reminder phrasing check",
                  rationale: "Validate tone next cycle",
                  reversible: true,
                  expectedValue: 0.5,
                  runAt: null,
                },
              ],
            },
          ],
        })
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          status: "success",
          summary: "Applied",
          actions: [],
        })
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          message: "run-1 digest",
        })
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          candidates: [
            {
              title: "Reminder clarity",
              confidence: 0.9,
              contradiction: false,
              expectedValue: 0.7,
              evidenceIds: ["task_audit:ta-follow-up-1", "command_audit:ca-follow-up-1"],
              rationale: "Strong signals",
              followUpActions: [
                {
                  title: "Run reminder phrasing check",
                  rationale: "Validate tone next cycle",
                  reversible: true,
                  expectedValue: 0.5,
                  runAt: null,
                },
              ],
            },
          ],
        })
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          status: "success",
          summary: "Applied",
          actions: [],
        })
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          message: "run-2 digest",
        })
      )

    let nowValue = 10_500
    const engine = createTaskExecutionEngine({
      logger: createLoggerStub(),
      ottoHome: tempRoot,
      jobsRepository,
      jobRunSessionsRepository,
      sessionBindingsRepository,
      outboundMessagesRepository,
      taskAuditRepository,
      commandAuditRepository,
      interactiveContextEventsRepository,
      eodLearningRepository,
      sessionGateway: {
        ensureSession: async () => "session-eod-follow-up",
        promptSession,
      },
      defaultWatchdogChatId: null,
      userProfileRepository: {
        get: () => null,
        setLastDigestAt: () => {},
      },
      now: () => nowValue,
    })

    const firstClaim = jobsRepository.claimDue(
      10_000,
      10,
      "lock-eod-follow-up-1",
      60_000,
      10_000
    )[0]
    if (!firstClaim) {
      throw new Error("Expected first due EOD task claim")
    }
    await engine.executeClaimedJob(firstClaim)

    nowValue = nowValue + 24 * 60 * 60 * 1000 + 1
    const secondClaim = jobsRepository.claimById(
      EOD_LEARNING_TASK_ID,
      nowValue,
      "lock-eod-follow-up-2",
      60_000,
      nowValue
    )
    if (!secondClaim) {
      throw new Error("Expected second due EOD task claim")
    }

    // Act
    await engine.executeClaimedJob(secondClaim)

    // Assert
    const followUpTasks = jobsRepository
      .listTasks()
      .filter((task) => task.type === "general-reminder" && task.id !== EOD_LEARNING_TASK_ID)
    expect(followUpTasks).toHaveLength(1)

    const latestRun = eodLearningRepository.listRecentRuns(1)[0]
    const latestDetails = eodLearningRepository.getRunDetails(latestRun?.id ?? "")
    const latestFollowUpAction = latestDetails?.items[0]?.actions.find(
      (action) => action.actionType === "follow_up_schedule"
    )
    expect(latestFollowUpAction?.status).toBe("skipped")

    const metadata = latestFollowUpAction?.metadataJson
      ? JSON.parse(latestFollowUpAction.metadataJson)
      : null
    expect(metadata?.reasonCode).toBe("duplicate_fingerprint")

    db.close()
  })

  it("classifies invalid assistant output as failed run for one-shot task", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const db = openPersistenceDatabase({ dbPath: path.join(tempRoot, "state.db") })
    const jobsRepository = createJobsRepository(db)
    const jobRunSessionsRepository = createJobRunSessionsRepository(db)
    const sessionBindingsRepository = createSessionBindingsRepository(db)
    const outboundMessagesRepository = createOutboundMessagesRepository(db)
    await writeMinimalTaskConfig(tempRoot)
    await writeMinimalPromptWorkspace(tempRoot)

    jobsRepository.createTask({
      id: "job-oneshot-1",
      type: "general-reminder",
      status: "idle",
      scheduleType: "oneshot",
      profileId: null,
      modelRef: null,
      runAt: 1_000,
      cadenceMinutes: null,
      payload: JSON.stringify({ message: "Ping team" }),
      lastRunAt: null,
      nextRunAt: 1_000,
      terminalState: null,
      terminalReason: null,
      lockToken: null,
      lockExpiresAt: null,
      createdAt: 100,
      updatedAt: 100,
    })

    const claimed = jobsRepository.claimDue(1_000, 10, "lock-2", 60_000, 1_000)[0]
    if (!claimed) {
      throw new Error("Expected due task claim")
    }

    const promptSession = vi.fn(async () => "this is not valid json")
    const logger = createLoggerStub()
    const engine = createTaskExecutionEngine({
      logger,
      ottoHome: tempRoot,
      jobsRepository,
      jobRunSessionsRepository,
      sessionBindingsRepository,
      outboundMessagesRepository,
      sessionGateway: {
        ensureSession: async () => "session-2",
        promptSession,
      },
      defaultWatchdogChatId: 777,
      userProfileRepository: {
        get: () => null,
        setLastDigestAt: () => {},
      },
      now: () => 3_000,
    })

    // Act
    await engine.executeClaimedJob(claimed)

    // Assert
    const runs = jobsRepository.listRunsByJobId("job-oneshot-1")
    expect(runs[0]?.status).toBe("failed")
    expect(runs[0]?.errorCode).toBe("invalid_result_json")
    expect(runs[0]?.resultJson).toContain("rawOutput")

    const task = jobsRepository.getById("job-oneshot-1")
    expect(task?.terminalState).toBe("completed")
    expect(task?.nextRunAt).toBeNull()
    expect(promptSession).toHaveBeenCalledTimes(3)

    db.close()
  })

  it("normalizes string-based errors from assistant output", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const db = openPersistenceDatabase({ dbPath: path.join(tempRoot, "state.db") })
    const jobsRepository = createJobsRepository(db)
    const jobRunSessionsRepository = createJobRunSessionsRepository(db)
    const sessionBindingsRepository = createSessionBindingsRepository(db)
    const outboundMessagesRepository = createOutboundMessagesRepository(db)
    await writeMinimalTaskConfig(tempRoot)
    await writeMinimalPromptWorkspace(tempRoot)

    jobsRepository.createTask({
      id: "job-oneshot-2",
      type: "general-reminder",
      status: "idle",
      scheduleType: "oneshot",
      profileId: null,
      modelRef: null,
      runAt: 1_000,
      cadenceMinutes: null,
      payload: JSON.stringify({ message: "Ping team" }),
      lastRunAt: null,
      nextRunAt: 1_000,
      terminalState: null,
      terminalReason: null,
      lockToken: null,
      lockExpiresAt: null,
      createdAt: 100,
      updatedAt: 100,
    })

    const claimed = jobsRepository.claimDue(1_000, 10, "lock-4", 60_000, 1_000)[0]
    if (!claimed) {
      throw new Error("Expected due task claim")
    }

    const logger = createLoggerStub()
    const engine = createTaskExecutionEngine({
      logger,
      ottoHome: tempRoot,
      jobsRepository,
      jobRunSessionsRepository,
      sessionBindingsRepository,
      outboundMessagesRepository,
      sessionGateway: {
        ensureSession: async () => "session-4",
        promptSession: async () =>
          JSON.stringify({
            status: "failed",
            summary: "Could not complete reminder",
            errors: ["telegram queue unavailable"],
          }),
      },
      defaultWatchdogChatId: 777,
      userProfileRepository: {
        get: () => null,
        setLastDigestAt: () => {},
      },
      now: () => 3_500,
    })

    // Act
    await engine.executeClaimedJob(claimed)

    // Assert
    const runs = jobsRepository.listRunsByJobId("job-oneshot-2")
    expect(runs[0]?.status).toBe("failed")
    expect(runs[0]?.errorCode).toBe("task_error")
    expect(runs[0]?.errorMessage).toBe("telegram queue unavailable")
    expect(runs[0]?.resultJson).toContain("telegram queue unavailable")
    expect(logger.warn).not.toHaveBeenCalled()

    db.close()
  })

  it("executes interactive background one-shot jobs with dedicated run session lifecycle", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const db = openPersistenceDatabase({ dbPath: path.join(tempRoot, "state.db") })
    const jobsRepository = createJobsRepository(db)
    const jobRunSessionsRepository = createJobRunSessionsRepository(db)
    const sessionBindingsRepository = createSessionBindingsRepository(db)
    const outboundMessagesRepository = createOutboundMessagesRepository(db)
    const interactiveContextEventsRepository = createInteractiveContextEventsRepository(db)
    await writeMinimalTaskConfig(tempRoot)
    await writeMinimalPromptWorkspace(tempRoot)

    jobsRepository.createTask({
      id: "job-background-1",
      type: INTERACTIVE_BACKGROUND_ONESHOT_JOB_TYPE,
      status: "idle",
      scheduleType: "oneshot",
      profileId: null,
      modelRef: null,
      runAt: 4_000,
      cadenceMinutes: null,
      payload: JSON.stringify({
        version: 1,
        source: {
          surface: "interactive",
          sessionId: "session-origin-1",
          sourceMessageId: "telegram-msg-1",
          chatId: 777,
        },
        request: {
          text: "Draft a migration plan for this repository",
          requestedAt: 3_900,
          rationale: "Long-running architecture analysis",
        },
      }),
      lastRunAt: null,
      nextRunAt: 4_000,
      terminalState: null,
      terminalReason: null,
      lockToken: null,
      lockExpiresAt: null,
      createdAt: 3_900,
      updatedAt: 3_900,
    })

    const claimed = jobsRepository.claimDue(4_000, 10, "lock-background-1", 60_000, 4_000)[0]
    if (!claimed) {
      throw new Error("Expected due background task claim")
    }

    const closeSession = vi.fn(async () => {})
    const promptSession = vi.fn(async () =>
      JSON.stringify({
        status: "success",
        summary: "Background execution completed with final deliverable.",
        errors: [],
      })
    )
    const logger = createLoggerStub()
    const nonInteractiveContextCaptureService = createNonInteractiveContextCaptureService({
      logger,
      interactiveContextEventsRepository,
    })
    const engine = createTaskExecutionEngine({
      logger,
      ottoHome: tempRoot,
      jobsRepository,
      jobRunSessionsRepository,
      sessionBindingsRepository,
      outboundMessagesRepository,
      sessionGateway: {
        ensureSession: async () => "session-background-run-1",
        closeSession,
        promptSession,
      },
      defaultWatchdogChatId: 777,
      userProfileRepository: {
        get: () => null,
        setLastDigestAt: () => {},
      },
      nonInteractiveContextCaptureService,
      now: () => 4_500,
    })

    // Act
    await engine.executeClaimedJob(claimed)

    // Assert
    const runs = jobsRepository.listRunsByJobId("job-background-1")
    expect(runs[0]?.status).toBe("success")
    expect(runs[0]?.resultJson).toContain("Background execution completed")

    const runSession = db
      .prepare(
        `SELECT
          run_id as runId,
          job_id as jobId,
          session_id as sessionId,
          closed_at as closedAt,
          close_error_message as closeErrorMessage
         FROM job_run_sessions
         WHERE run_id = ?`
      )
      .get(runs[0]?.id) as {
      runId: string
      jobId: string
      sessionId: string
      closedAt: number | null
      closeErrorMessage: string | null
    }

    expect(runSession).toMatchObject({
      jobId: "job-background-1",
      sessionId: "session-background-run-1",
      closeErrorMessage: null,
    })
    expect(runSession.closedAt).toBe(4_500)
    expect(closeSession).toHaveBeenCalledWith("session-background-run-1")
    expect(promptSession).toHaveBeenCalledWith(
      "session-background-run-1",
      expect.stringContaining("Execute this interactive background request now."),
      expect.objectContaining({
        systemPrompt: expect.stringContaining("## Surface\nBackground surface"),
      })
    )
    expect(promptSession).toHaveBeenCalledWith(
      "session-background-run-1",
      expect.any(String),
      expect.objectContaining({
        systemPrompt: expect.stringContaining("## Media\nChatapps media"),
      })
    )
    expect(promptSession).toHaveBeenCalledWith(
      "session-background-run-1",
      expect.any(String),
      expect.objectContaining({
        tools: {
          spawn_background_job: false,
        },
      })
    )

    const task = jobsRepository.getById("job-background-1")
    expect(task?.terminalState).toBe("completed")
    expect(task?.nextRunAt).toBeNull()

    const capturedContextEvents = db
      .prepare(
        `SELECT
          source_session_id as sourceSessionId,
          source_lane as sourceLane,
          source_kind as sourceKind,
          delivery_status as deliveryStatus,
          delivery_status_detail as deliveryStatusDetail,
          content
         FROM interactive_context_events
         WHERE source_session_id = ?
         ORDER BY created_at ASC`
      )
      .all("session-origin-1") as Array<{
      sourceSessionId: string
      sourceLane: string
      sourceKind: string
      deliveryStatus: string
      deliveryStatusDetail: string | null
      content: string
    }>

    expect(capturedContextEvents).toHaveLength(2)
    expect(capturedContextEvents[0]).toMatchObject({
      sourceSessionId: "session-origin-1",
      sourceLane: "scheduler",
      sourceKind: "background_lifecycle",
      deliveryStatus: "queued",
      deliveryStatusDetail: "enqueued",
    })
    expect(capturedContextEvents.map((event) => event.content)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Started your background run"),
        expect.stringContaining("Background run completed successfully"),
      ])
    )

    db.close()
  })

  it("records session close errors for interactive background runs", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const db = openPersistenceDatabase({ dbPath: path.join(tempRoot, "state.db") })
    const jobsRepository = createJobsRepository(db)
    const jobRunSessionsRepository = createJobRunSessionsRepository(db)
    const sessionBindingsRepository = createSessionBindingsRepository(db)
    const outboundMessagesRepository = createOutboundMessagesRepository(db)
    await writeMinimalTaskConfig(tempRoot)

    jobsRepository.createTask({
      id: "job-background-2",
      type: INTERACTIVE_BACKGROUND_ONESHOT_JOB_TYPE,
      status: "idle",
      scheduleType: "oneshot",
      profileId: null,
      modelRef: null,
      runAt: 5_000,
      cadenceMinutes: null,
      payload: JSON.stringify({
        version: 1,
        source: {
          surface: "interactive",
          sessionId: null,
          sourceMessageId: null,
          chatId: null,
        },
        request: {
          text: "Prepare weekly summary",
          requestedAt: 4_900,
          rationale: null,
        },
      }),
      lastRunAt: null,
      nextRunAt: 5_000,
      terminalState: null,
      terminalReason: null,
      lockToken: null,
      lockExpiresAt: null,
      createdAt: 4_900,
      updatedAt: 4_900,
    })

    const claimed = jobsRepository.claimDue(5_000, 10, "lock-background-2", 60_000, 5_000)[0]
    if (!claimed) {
      throw new Error("Expected due background task claim")
    }

    const logger = createLoggerStub()
    const engine = createTaskExecutionEngine({
      logger,
      ottoHome: tempRoot,
      jobsRepository,
      jobRunSessionsRepository,
      sessionBindingsRepository,
      outboundMessagesRepository,
      sessionGateway: {
        ensureSession: async () => "session-background-run-2",
        closeSession: async () => {
          throw new Error("close failed")
        },
        promptSession: async () =>
          JSON.stringify({
            status: "success",
            summary: "Done.",
            errors: [],
          }),
      },
      defaultWatchdogChatId: 777,
      userProfileRepository: {
        get: () => null,
        setLastDigestAt: () => {},
      },
      now: () => 5_500,
    })

    // Act
    await engine.executeClaimedJob(claimed)

    // Assert
    const run = jobsRepository.listRunsByJobId("job-background-2")[0]
    const runSession = db
      .prepare(
        "SELECT close_error_message as closeErrorMessage FROM job_run_sessions WHERE run_id = ?"
      )
      .get(run?.id) as { closeErrorMessage: string | null }

    expect(runSession.closeErrorMessage).toBe("close failed")
    expect(logger.warn).toHaveBeenCalled()

    db.close()
  })

  it("classifies non-JSON interactive background output as failed run", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const db = openPersistenceDatabase({ dbPath: path.join(tempRoot, "state.db") })
    const jobsRepository = createJobsRepository(db)
    const jobRunSessionsRepository = createJobRunSessionsRepository(db)
    const sessionBindingsRepository = createSessionBindingsRepository(db)
    const outboundMessagesRepository = createOutboundMessagesRepository(db)
    await writeMinimalTaskConfig(tempRoot)

    jobsRepository.createTask({
      id: "job-background-3",
      type: INTERACTIVE_BACKGROUND_ONESHOT_JOB_TYPE,
      status: "idle",
      scheduleType: "oneshot",
      profileId: null,
      modelRef: null,
      runAt: 6_000,
      cadenceMinutes: null,
      payload: JSON.stringify({
        version: 1,
        source: {
          surface: "interactive",
          sessionId: null,
          sourceMessageId: null,
          chatId: null,
        },
        request: {
          text: "Analyze production issue",
          requestedAt: 5_900,
          rationale: null,
        },
      }),
      lastRunAt: null,
      nextRunAt: 6_000,
      terminalState: null,
      terminalReason: null,
      lockToken: null,
      lockExpiresAt: null,
      createdAt: 5_900,
      updatedAt: 5_900,
    })

    const claimed = jobsRepository.claimDue(6_000, 10, "lock-background-3", 60_000, 6_000)[0]
    if (!claimed) {
      throw new Error("Expected due background task claim")
    }

    const promptSession = vi.fn(async () => "I could not complete this request.")
    const logger = createLoggerStub()
    const engine = createTaskExecutionEngine({
      logger,
      ottoHome: tempRoot,
      jobsRepository,
      jobRunSessionsRepository,
      sessionBindingsRepository,
      outboundMessagesRepository,
      sessionGateway: {
        ensureSession: async () => "session-background-run-3",
        closeSession: async () => {},
        promptSession,
      },
      defaultWatchdogChatId: 777,
      userProfileRepository: {
        get: () => null,
        setLastDigestAt: () => {},
      },
      now: () => 6_500,
    })

    // Act
    await engine.executeClaimedJob(claimed)

    // Assert
    const run = jobsRepository.listRunsByJobId("job-background-3")[0]
    expect(run?.status).toBe("failed")
    expect(run?.errorCode).toBe("invalid_result_json")
    expect(promptSession).toHaveBeenCalledTimes(3)
    expect(promptSession.mock.calls[1]?.[2]).toMatchObject({
      tools: {
        spawn_background_job: false,
      },
    })

    db.close()
  })

  it("retries transient background transport errors before succeeding", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const db = openPersistenceDatabase({ dbPath: path.join(tempRoot, "state.db") })
    const jobsRepository = createJobsRepository(db)
    const jobRunSessionsRepository = createJobRunSessionsRepository(db)
    const sessionBindingsRepository = createSessionBindingsRepository(db)
    const outboundMessagesRepository = createOutboundMessagesRepository(db)
    await writeMinimalTaskConfig(tempRoot)

    jobsRepository.createTask({
      id: "job-background-retry-1",
      type: INTERACTIVE_BACKGROUND_ONESHOT_JOB_TYPE,
      status: "idle",
      scheduleType: "oneshot",
      profileId: null,
      modelRef: null,
      runAt: 7_000,
      cadenceMinutes: null,
      payload: JSON.stringify({
        version: 1,
        source: {
          surface: "interactive",
          sessionId: null,
          sourceMessageId: null,
          chatId: null,
        },
        request: {
          text: "Run a background retry validation",
          requestedAt: 6_900,
          rationale: null,
        },
      }),
      lastRunAt: null,
      nextRunAt: 7_000,
      terminalState: null,
      terminalReason: null,
      lockToken: null,
      lockExpiresAt: null,
      createdAt: 6_900,
      updatedAt: 6_900,
    })

    const claimed = jobsRepository.claimDue(7_000, 10, "lock-background-retry-1", 60_000, 7_000)[0]
    if (!claimed) {
      throw new Error("Expected due background task claim")
    }

    const promptSession = vi
      .fn()
      .mockRejectedValueOnce(new Error("fetch failed"))
      .mockResolvedValue(
        JSON.stringify({
          status: "success",
          summary: "Retry recovered successfully.",
          errors: [],
        })
      )

    const logger = createLoggerStub()
    const engine = createTaskExecutionEngine({
      logger,
      ottoHome: tempRoot,
      jobsRepository,
      jobRunSessionsRepository,
      sessionBindingsRepository,
      outboundMessagesRepository,
      sessionGateway: {
        ensureSession: async () => "session-background-retry-1",
        closeSession: async () => {},
        promptSession,
      },
      backgroundExecution: {
        requestTimeoutMs: null,
        stallTimeoutMs: 60_000,
        transientRetryCount: 1,
        retryBaseMs: 1,
        retryMaxMs: 1,
      },
      defaultWatchdogChatId: 777,
      userProfileRepository: {
        get: () => null,
        setLastDigestAt: () => {},
      },
      now: () => 7_500,
    })

    // Act
    await engine.executeClaimedJob(claimed)

    // Assert
    const run = jobsRepository.listRunsByJobId("job-background-retry-1")[0]
    expect(run?.status).toBe("success")
    expect(promptSession).toHaveBeenCalledTimes(2)
    expect(promptSession.mock.calls[0]?.[2]?.requestTimeoutMs).toBeNull()
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "job-background-retry-1",
        errorCode: "task_network_error",
      }),
      "Interactive background execution failed with transient error; retrying"
    )

    db.close()
  })

  it("maps repeated background fetch failures to task_network_error", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const db = openPersistenceDatabase({ dbPath: path.join(tempRoot, "state.db") })
    const jobsRepository = createJobsRepository(db)
    const jobRunSessionsRepository = createJobRunSessionsRepository(db)
    const sessionBindingsRepository = createSessionBindingsRepository(db)
    const outboundMessagesRepository = createOutboundMessagesRepository(db)
    await writeMinimalTaskConfig(tempRoot)

    jobsRepository.createTask({
      id: "job-background-retry-2",
      type: INTERACTIVE_BACKGROUND_ONESHOT_JOB_TYPE,
      status: "idle",
      scheduleType: "oneshot",
      profileId: null,
      modelRef: null,
      runAt: 8_000,
      cadenceMinutes: null,
      payload: JSON.stringify({
        version: 1,
        source: {
          surface: "interactive",
          sessionId: null,
          sourceMessageId: null,
          chatId: null,
        },
        request: {
          text: "Run a background failure classification validation",
          requestedAt: 7_900,
          rationale: null,
        },
      }),
      lastRunAt: null,
      nextRunAt: 8_000,
      terminalState: null,
      terminalReason: null,
      lockToken: null,
      lockExpiresAt: null,
      createdAt: 7_900,
      updatedAt: 7_900,
    })

    const claimed = jobsRepository.claimDue(8_000, 10, "lock-background-retry-2", 60_000, 8_000)[0]
    if (!claimed) {
      throw new Error("Expected due background task claim")
    }

    const engine = createTaskExecutionEngine({
      logger: createLoggerStub(),
      ottoHome: tempRoot,
      jobsRepository,
      jobRunSessionsRepository,
      sessionBindingsRepository,
      outboundMessagesRepository,
      sessionGateway: {
        ensureSession: async () => "session-background-retry-2",
        closeSession: async () => {},
        promptSession: async () => {
          throw new Error("fetch failed")
        },
      },
      backgroundExecution: {
        requestTimeoutMs: null,
        stallTimeoutMs: 60_000,
        transientRetryCount: 0,
        retryBaseMs: 1,
        retryMaxMs: 1,
      },
      defaultWatchdogChatId: 777,
      userProfileRepository: {
        get: () => null,
        setLastDigestAt: () => {},
      },
      now: () => 8_500,
    })

    // Act
    await engine.executeClaimedJob(claimed)

    // Assert
    const run = jobsRepository.listRunsByJobId("job-background-retry-2")[0]
    expect(run?.status).toBe("failed")
    expect(run?.errorCode).toBe("task_network_error")
    expect(run?.errorMessage).toBe("fetch failed")

    db.close()
  })

  it("maps stalled background runs to task_stalled", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const db = openPersistenceDatabase({ dbPath: path.join(tempRoot, "state.db") })
    const jobsRepository = createJobsRepository(db)
    const jobRunSessionsRepository = createJobRunSessionsRepository(db)
    const sessionBindingsRepository = createSessionBindingsRepository(db)
    const outboundMessagesRepository = createOutboundMessagesRepository(db)
    await writeMinimalTaskConfig(tempRoot)

    jobsRepository.createTask({
      id: "job-background-stall-1",
      type: INTERACTIVE_BACKGROUND_ONESHOT_JOB_TYPE,
      status: "idle",
      scheduleType: "oneshot",
      profileId: null,
      modelRef: null,
      runAt: 9_000,
      cadenceMinutes: null,
      payload: JSON.stringify({
        version: 1,
        source: {
          surface: "interactive",
          sessionId: null,
          sourceMessageId: null,
          chatId: null,
        },
        request: {
          text: "Run a stall watchdog validation",
          requestedAt: 8_900,
          rationale: null,
        },
      }),
      lastRunAt: null,
      nextRunAt: 9_000,
      terminalState: null,
      terminalReason: null,
      lockToken: null,
      lockExpiresAt: null,
      createdAt: 8_900,
      updatedAt: 8_900,
    })

    const claimed = jobsRepository.claimDue(9_000, 10, "lock-background-stall-1", 60_000, 9_000)[0]
    if (!claimed) {
      throw new Error("Expected due background task claim")
    }

    const engine = createTaskExecutionEngine({
      logger: createLoggerStub(),
      ottoHome: tempRoot,
      jobsRepository,
      jobRunSessionsRepository,
      sessionBindingsRepository,
      outboundMessagesRepository,
      sessionGateway: {
        ensureSession: async () => "session-background-stall-1",
        closeSession: async () => {},
        promptSession: async (_sessionId, _text, options) => {
          await new Promise((_, reject) => {
            options?.signal?.addEventListener(
              "abort",
              () => reject(new DOMException("Aborted", "AbortError")),
              { once: true }
            )
          })
          return ""
        },
      },
      backgroundExecution: {
        requestTimeoutMs: null,
        stallTimeoutMs: 5,
        transientRetryCount: 0,
        retryBaseMs: 1,
        retryMaxMs: 1,
      },
      defaultWatchdogChatId: 777,
      userProfileRepository: {
        get: () => null,
        setLastDigestAt: () => {},
      },
      now: () => 9_500,
    })

    // Act
    await engine.executeClaimedJob(claimed)

    // Assert
    const run = jobsRepository.listRunsByJobId("job-background-stall-1")[0]
    expect(run?.status).toBe("failed")
    expect(run?.errorCode).toBe("task_stalled")
    expect(run?.errorMessage).toBe("Background run exceeded no-progress watchdog window")

    db.close()
  })

  it("executes watchdog task and queues alert through existing outbound infrastructure", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const db = openPersistenceDatabase({ dbPath: path.join(tempRoot, "state.db") })
    const jobsRepository = createJobsRepository(db)
    const jobRunSessionsRepository = createJobRunSessionsRepository(db)
    const sessionBindingsRepository = createSessionBindingsRepository(db)
    const outboundMessagesRepository = createOutboundMessagesRepository(db)
    await writeMinimalTaskConfig(tempRoot)
    await writeMinimalPromptWorkspace(tempRoot, {
      userMapping: {
        version: 1,
        selectors: {
          watchdog: {
            default: "watchdog-user",
          },
        },
        routes: {
          "watchdog-default": {
            layers: {
              "core-persona": {
                source: "user",
                path: "layers/watchdog-user.md",
              },
            },
          },
          "watchdog-user": {
            layers: {
              "core-persona": {
                source: "user",
                path: "layers/watchdog-user.md",
              },
            },
          },
        },
      },
    })
    await writeFile(
      path.join(tempRoot, "prompts", "layers", "watchdog-user.md"),
      "# User\n",
      "utf8"
    )

    jobsRepository.createTask({
      id: "task-failed-1",
      type: "email-triage",
      status: "paused",
      scheduleType: "recurring",
      profileId: null,
      modelRef: null,
      runAt: null,
      cadenceMinutes: 30,
      payload: null,
      lastRunAt: null,
      nextRunAt: null,
      terminalState: null,
      terminalReason: null,
      lockToken: null,
      lockExpiresAt: null,
      createdAt: 100,
      updatedAt: 100,
    })
    jobsRepository.insertRun({
      id: "run-failed-1",
      jobId: "task-failed-1",
      scheduledFor: 1_000,
      startedAt: 1_100,
      finishedAt: null,
      status: "skipped",
      errorCode: null,
      errorMessage: null,
      resultJson: null,
      createdAt: 1_100,
    })
    jobsRepository.markRunFinished(
      "run-failed-1",
      "failed",
      1_150,
      "tool_failure",
      "Tool call failed",
      null
    )

    jobsRepository.createTask({
      id: "watchdog-task-1",
      type: "watchdog_failures",
      status: "idle",
      scheduleType: "recurring",
      profileId: null,
      modelRef: null,
      runAt: null,
      cadenceMinutes: 30,
      payload: JSON.stringify({
        lookbackMinutes: 120,
        maxFailures: 20,
        threshold: 1,
        notify: true,
      }),
      lastRunAt: null,
      nextRunAt: 2_000,
      terminalState: null,
      terminalReason: null,
      lockToken: null,
      lockExpiresAt: null,
      createdAt: 100,
      updatedAt: 100,
    })

    const claimed = jobsRepository.claimDue(2_000, 10, "lock-3", 60_000, 2_000)[0]
    if (!claimed) {
      throw new Error("Expected due watchdog claim")
    }

    const promptSession = vi.fn(async () =>
      JSON.stringify({
        message:
          "Watchdog alert: 1 failed run in last 120m (threshold 1).\n- email-triage: Tool call failed",
      })
    )

    const logger = createLoggerStub()
    const engine = createTaskExecutionEngine({
      logger,
      ottoHome: tempRoot,
      jobsRepository,
      jobRunSessionsRepository,
      sessionBindingsRepository,
      outboundMessagesRepository,
      sessionGateway: {
        ensureSession: async () => "session-3",
        promptSession,
      },
      defaultWatchdogChatId: 777,
      userProfileRepository: {
        get: () => null,
        setLastDigestAt: () => {},
      },
      now: () => 2_500,
    })

    // Act
    await engine.executeClaimedJob(claimed)

    // Assert
    const runs = jobsRepository.listRunsByJobId("watchdog-task-1")
    expect(runs[0]?.status).toBe("success")
    expect(runs[0]?.resultJson).toContain("Watchdog checked")
    expect(outboundMessagesRepository.listDue(10_000)).toHaveLength(1)
    expect(outboundMessagesRepository.listDue(10_000)[0]?.content).toContain("email-triage")
    expect(promptSession).toHaveBeenCalledTimes(1)
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ warningCode: "watchdog_user_override_blocked" }),
      expect.stringContaining("watchdog")
    )

    db.close()
  })

  it("falls back to built-in watchdog formatter when model output is invalid", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const db = openPersistenceDatabase({ dbPath: path.join(tempRoot, "state.db") })
    const jobsRepository = createJobsRepository(db)
    const jobRunSessionsRepository = createJobRunSessionsRepository(db)
    const sessionBindingsRepository = createSessionBindingsRepository(db)
    const outboundMessagesRepository = createOutboundMessagesRepository(db)
    await writeMinimalTaskConfig(tempRoot)
    await writeMinimalPromptWorkspace(tempRoot)

    jobsRepository.createTask({
      id: "task-failed-fallback",
      type: "email-triage",
      status: "paused",
      scheduleType: "recurring",
      profileId: null,
      modelRef: null,
      runAt: null,
      cadenceMinutes: 30,
      payload: null,
      lastRunAt: null,
      nextRunAt: null,
      terminalState: null,
      terminalReason: null,
      lockToken: null,
      lockExpiresAt: null,
      createdAt: 100,
      updatedAt: 100,
    })
    jobsRepository.insertRun({
      id: "run-failed-fallback",
      jobId: "task-failed-fallback",
      scheduledFor: 1_000,
      startedAt: 1_100,
      finishedAt: null,
      status: "skipped",
      errorCode: null,
      errorMessage: null,
      resultJson: null,
      createdAt: 1_100,
    })
    jobsRepository.markRunFinished(
      "run-failed-fallback",
      "failed",
      1_150,
      "tool_failure",
      "Tool call failed",
      null
    )

    jobsRepository.createTask({
      id: "watchdog-task-fallback",
      type: "watchdog_failures",
      status: "idle",
      scheduleType: "recurring",
      profileId: null,
      modelRef: null,
      runAt: null,
      cadenceMinutes: 30,
      payload: JSON.stringify({
        lookbackMinutes: 120,
        maxFailures: 20,
        threshold: 1,
        notify: true,
      }),
      lastRunAt: null,
      nextRunAt: 2_000,
      terminalState: null,
      terminalReason: null,
      lockToken: null,
      lockExpiresAt: null,
      createdAt: 100,
      updatedAt: 100,
    })

    const claimed = jobsRepository.claimDue(2_000, 10, "lock-fallback", 60_000, 2_000)[0]
    if (!claimed) {
      throw new Error("Expected due watchdog claim")
    }

    const promptSession = vi.fn(async () => "not valid json")
    const logger = createLoggerStub()
    const engine = createTaskExecutionEngine({
      logger,
      ottoHome: tempRoot,
      jobsRepository,
      jobRunSessionsRepository,
      sessionBindingsRepository,
      outboundMessagesRepository,
      sessionGateway: {
        ensureSession: async () => "session-watchdog-fallback",
        promptSession,
      },
      defaultWatchdogChatId: 777,
      userProfileRepository: {
        get: () => null,
        setLastDigestAt: () => {},
      },
      now: () => 2_500,
    })

    // Act
    await engine.executeClaimedJob(claimed)

    // Assert
    const queued = outboundMessagesRepository.listDue(10_000)
    expect(queued).toHaveLength(1)
    expect(queued[0]?.content).toContain("Watchdog alert: 1 failed task runs")
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        parseErrorCode: "invalid_watchdog_alert_json",
      }),
      "Watchdog alert generation returned invalid output; using fallback formatter"
    )
    expect(promptSession).toHaveBeenCalledTimes(3)

    db.close()
  })

  it("skips watchdog notification enqueue when watchdog alerts are disabled", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const db = openPersistenceDatabase({ dbPath: path.join(tempRoot, "state.db") })
    const jobsRepository = createJobsRepository(db)
    const jobRunSessionsRepository = createJobRunSessionsRepository(db)
    const sessionBindingsRepository = createSessionBindingsRepository(db)
    const outboundMessagesRepository = createOutboundMessagesRepository(db)
    await writeMinimalTaskConfig(tempRoot)
    await writeMinimalPromptWorkspace(tempRoot)

    jobsRepository.createTask({
      id: "task-failed-disabled",
      type: "email-triage",
      status: "paused",
      scheduleType: "recurring",
      profileId: null,
      modelRef: null,
      runAt: null,
      cadenceMinutes: 30,
      payload: null,
      lastRunAt: null,
      nextRunAt: null,
      terminalState: null,
      terminalReason: null,
      lockToken: null,
      lockExpiresAt: null,
      createdAt: 100,
      updatedAt: 100,
    })
    jobsRepository.insertRun({
      id: "run-failed-disabled",
      jobId: "task-failed-disabled",
      scheduledFor: 1_000,
      startedAt: 1_100,
      finishedAt: null,
      status: "skipped",
      errorCode: null,
      errorMessage: null,
      resultJson: null,
      createdAt: 1_100,
    })
    jobsRepository.markRunFinished(
      "run-failed-disabled",
      "failed",
      1_150,
      "tool_failure",
      "Tool call failed",
      null
    )

    jobsRepository.createTask({
      id: "watchdog-task-disabled",
      type: "watchdog_failures",
      status: "idle",
      scheduleType: "recurring",
      profileId: null,
      modelRef: null,
      runAt: null,
      cadenceMinutes: 30,
      payload: JSON.stringify({
        lookbackMinutes: 120,
        maxFailures: 20,
        threshold: 1,
        notify: true,
      }),
      lastRunAt: null,
      nextRunAt: 2_000,
      terminalState: null,
      terminalReason: null,
      lockToken: null,
      lockExpiresAt: null,
      createdAt: 100,
      updatedAt: 100,
    })

    const claimed = jobsRepository.claimDue(2_000, 10, "lock-disabled", 60_000, 2_000)[0]
    if (!claimed) {
      throw new Error("Expected due watchdog claim")
    }

    const engine = createTaskExecutionEngine({
      logger: createLoggerStub(),
      ottoHome: tempRoot,
      jobsRepository,
      jobRunSessionsRepository,
      sessionBindingsRepository,
      outboundMessagesRepository,
      sessionGateway: {
        ensureSession: async () => "session-watchdog-disabled",
        promptSession: async () => "not used",
      },
      defaultWatchdogChatId: 777,
      userProfileRepository: {
        get: () => ({
          timezone: "Europe/Vienna",
          quietHoursStart: "20:00",
          quietHoursEnd: "08:00",
          quietMode: "critical_only",
          muteUntil: null,
          watchdogAlertsEnabled: false,
          watchdogMuteUntil: null,
          interactiveContextWindowSize: 20,
          contextRetentionCap: 100,
          onboardingCompletedAt: null,
          lastDigestAt: null,
          updatedAt: 2_000,
        }),
        setLastDigestAt: () => {},
      },
      now: () => 2_500,
    })

    // Act
    await engine.executeClaimedJob(claimed)

    // Assert
    const runs = jobsRepository.listRunsByJobId("watchdog-task-disabled")
    expect(runs[0]?.status).toBe("success")
    expect(runs[0]?.resultJson).toContain("notification skipped: disabled")
    expect(outboundMessagesRepository.listDue(10_000)).toHaveLength(0)

    db.close()
  })
})
