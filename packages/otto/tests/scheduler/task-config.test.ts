import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import {
  buildEffectiveTaskExecutionConfig,
  loadTaskProfile,
  loadTaskRuntimeBaseConfig,
  resolveTaskConfigDirectory,
} from "../../src/scheduler/task-config.js"

const TEMP_PREFIX = path.join(tmpdir(), "otto-task-config-")
const cleanupPaths: string[] = []

afterEach(async () => {
  await Promise.all(
    cleanupPaths.splice(0).map(async (directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe("task-config", () => {
  it("loads base config and profile then merges lane overlays deterministically", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const taskConfigDirectory = resolveTaskConfigDirectory(tempRoot)
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
                  tools: {
                    skill: true,
                  },
                  prompt: "base prompt",
                },
              },
              permission: {
                skill: {
                  "*": "allow",
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
                      skill: false,
                    },
                    prompt: "scheduled prompt",
                  },
                },
                permission: {
                  skill: {
                    "*": "deny",
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
      path.join(taskConfigDirectory, "profiles", "email-check.jsonc"),
      JSON.stringify(
        {
          version: 1,
          id: "email-check",
          laneOverrides: {
            scheduled: {
              opencode: {
                agent: {
                  assistant: {
                    tools: {
                      skill: true,
                    },
                  },
                },
                permission: {
                  skill: {
                    "email-*": "allow",
                    "*": "deny",
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

    // Act
    const base = await loadTaskRuntimeBaseConfig(tempRoot)
    const profile = await loadTaskProfile(tempRoot, "email-check")
    const effective = buildEffectiveTaskExecutionConfig(base, "scheduled", profile)

    // Assert
    expect(effective).toEqual({
      opencodeConfig: {
        agent: {
          assistant: {
            tools: {
              skill: true,
            },
            prompt: "scheduled prompt",
          },
        },
        permission: {
          skill: {
            "email-*": "allow",
            "*": "deny",
          },
        },
      },
    })
  })

  it("throws when profile id does not match file name", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const taskConfigDirectory = resolveTaskConfigDirectory(tempRoot)
    await mkdir(path.join(taskConfigDirectory, "profiles"), { recursive: true })

    await writeFile(
      path.join(taskConfigDirectory, "profiles", "wrong-name.jsonc"),
      JSON.stringify(
        {
          version: 1,
          id: "different-id",
          laneOverrides: {},
        },
        null,
        2
      ),
      "utf8"
    )

    // Act and Assert
    await expect(loadTaskProfile(tempRoot, "wrong-name")).rejects.toThrow("id mismatch")
  })

  it("loads JSONC with comments and trailing commas", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const taskConfigDirectory = resolveTaskConfigDirectory(tempRoot)
    await mkdir(path.join(taskConfigDirectory, "profiles"), { recursive: true })

    await writeFile(
      path.join(taskConfigDirectory, "base.jsonc"),
      `{
  // base task execution config
  "version": 1,
  "base": {
    "opencode": {
      "agent": {
        "assistant": {
          "tools": {
            "skill": true,
          },
          "prompt": "base prompt",
        },
      },
    },
  },
  "lanes": {
    "scheduled": {
      "opencode": {
        "agent": {
          "assistant": {
            "prompt": "scheduled prompt",
          },
        },
      },
    },
  },
}
`,
      "utf8"
    )

    // Act
    const loaded = await loadTaskRuntimeBaseConfig(tempRoot)

    // Assert
    expect(JSON.stringify(loaded)).toContain("base prompt")
    expect(JSON.stringify(loaded)).toContain("scheduled prompt")
  })

  it("enforces the EOD scheduled profile tool contract without broadening unrelated tools", async () => {
    // Arrange
    const tempRoot = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(tempRoot)
    const taskConfigDirectory = resolveTaskConfigDirectory(tempRoot)
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
                  tools: {
                    skill: true,
                  },
                  prompt: "base prompt",
                },
              },
              permission: {
                skill: {
                  "*": "allow",
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
                      skill: false,
                      create_task: false,
                      update_task: false,
                      delete_task: false,
                      list_tasks: true,
                      check_task_failures: true,
                      queue_telegram_message: true,
                      report_background_milestone: false,
                      get_notification_policy: true,
                      set_notification_policy: true,
                    },
                    prompt:
                      "You are Otto in scheduled automation mode. Return strict JSON with keys status, summary, and errors.",
                  },
                },
                permission: {
                  skill: {
                    "*": "deny",
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
      path.join(taskConfigDirectory, "profiles", "eod-learning.jsonc"),
      JSON.stringify(
        {
          version: 1,
          id: "eod-learning",
          laneOverrides: {
            scheduled: {
              opencode: {
                agent: {
                  assistant: {
                    tools: {
                      skill: true,
                      create_task: true,
                      update_task: true,
                      delete_task: false,
                      list_tasks: true,
                      check_task_failures: true,
                      queue_telegram_message: true,
                      queue_telegram_file: false,
                      report_background_milestone: false,
                      get_notification_policy: false,
                      set_notification_policy: false,
                      list_task_audit: true,
                      get_journal_config: true,
                      set_journal_tags: true,
                      memory_list: true,
                      memory_set: true,
                      memory_replace: true,
                    },
                    prompt:
                      "You are Otto in scheduled EOD learning mode. Return strict JSON with exactly these keys: status, summary, errors.",
                  },
                },
                permission: {
                  skill: {
                    "*": "allow",
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

    // Act
    const base = await loadTaskRuntimeBaseConfig(tempRoot)
    const profile = await loadTaskProfile(tempRoot, "eod-learning")
    const effective = buildEffectiveTaskExecutionConfig(base, "scheduled", profile)

    // Assert
    expect(effective).toEqual({
      opencodeConfig: {
        agent: {
          assistant: {
            tools: {
              skill: true,
              create_task: true,
              update_task: true,
              delete_task: false,
              list_tasks: true,
              check_task_failures: true,
              queue_telegram_message: true,
              queue_telegram_file: false,
              report_background_milestone: false,
              get_notification_policy: false,
              set_notification_policy: false,
              list_task_audit: true,
              get_journal_config: true,
              set_journal_tags: true,
              memory_list: true,
              memory_set: true,
              memory_replace: true,
            },
            prompt:
              "You are Otto in scheduled EOD learning mode. Return strict JSON with exactly these keys: status, summary, errors.",
          },
        },
        permission: {
          skill: {
            "*": "allow",
          },
        },
      },
    })

    const withoutProfile = buildEffectiveTaskExecutionConfig(base, "scheduled")
    expect(withoutProfile).toEqual({
      opencodeConfig: {
        agent: {
          assistant: {
            tools: {
              skill: false,
              create_task: false,
              update_task: false,
              delete_task: false,
              list_tasks: true,
              check_task_failures: true,
              queue_telegram_message: true,
              report_background_milestone: false,
              get_notification_policy: true,
              set_notification_policy: true,
            },
            prompt:
              "You are Otto in scheduled automation mode. Return strict JSON with keys status, summary, and errors.",
          },
        },
        permission: {
          skill: {
            "*": "deny",
          },
        },
      },
    })
  })
})
