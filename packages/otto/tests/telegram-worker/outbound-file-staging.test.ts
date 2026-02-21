import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import { stageOutboundTelegramFile } from "../../src/telegram-worker/outbound-file-staging.js"

const TEMP_PREFIX = path.join(tmpdir(), "otto-outbound-stage-")
const cleanupPaths: string[] = []

afterEach(async () => {
  await Promise.all(
    cleanupPaths.splice(0).map(async (directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe("stageOutboundTelegramFile", () => {
  it("stages a file inside ottoHome", async () => {
    // Arrange
    const root = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(root)
    const ottoHome = path.join(root, ".otto")
    await mkdir(path.join(ottoHome, "inbox"), { recursive: true })
    await writeFile(path.join(ottoHome, "inbox", "report.txt"), "hello", "utf8")

    // Act
    const staged = await stageOutboundTelegramFile({
      requestedPath: "inbox/report.txt",
      ottoHome,
      maxBytes: 1024,
    })

    // Assert
    expect(staged.sourcePath).toContain(path.join(ottoHome, "inbox", "report.txt"))
    expect(staged.stagedPath).toContain(path.join(ottoHome, "data", "telegram-outbox"))
  })

  it("rejects symlink traversal outside ottoHome", async () => {
    // Arrange
    const root = await mkdtemp(TEMP_PREFIX)
    cleanupPaths.push(root)
    const ottoHome = path.join(root, ".otto")
    const outside = path.join(root, "outside")
    await mkdir(path.join(ottoHome, "inbox"), { recursive: true })
    await mkdir(outside, { recursive: true })
    await writeFile(path.join(outside, "secret.txt"), "top-secret", "utf8")
    await symlink(outside, path.join(ottoHome, "inbox", "shared"))

    // Act / Assert
    await expect(
      stageOutboundTelegramFile({
        requestedPath: "inbox/shared/secret.txt",
        ottoHome,
        maxBytes: 1024,
      })
    ).rejects.toThrow("file_path_outside_otto_home")
  })
})
