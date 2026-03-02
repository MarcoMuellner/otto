import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import { writeDoctorIncidentReport } from "../../src/doctor/report/write-incident.js"

const TEMP_PREFIX = path.join(tmpdir(), "otto-doctor-incident-")

const createdRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    createdRoots.splice(0).map(async (root) => {
      await rm(root, { recursive: true, force: true })
    })
  )
})

describe("writeDoctorIncidentReport", () => {
  it("writes incident markdown under OTTO_HOME logs path", async () => {
    // Arrange
    const root = await mkdtemp(TEMP_PREFIX)
    createdRoots.push(root)

    // Act
    const filePath = await writeDoctorIncidentReport({
      content: "# Incident\n",
      mode: "deep",
      verdict: "red",
      environment: {
        OTTO_HOME: root,
      },
      now: new Date("2026-03-02T12:00:00.123Z"),
    })

    // Assert
    expect(filePath).toContain(path.join(root, "logs", "doctor", "incidents"))
    expect(path.basename(filePath)).toBe("doctor-incident-20260302-120000-123-deep-red.md")
    await expect(readFile(filePath, "utf8")).resolves.toBe("# Incident\n")
  })
})
