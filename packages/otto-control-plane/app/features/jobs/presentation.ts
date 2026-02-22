const SYSTEM_JOB_TYPE_LABELS: Record<string, string> = {
  heartbeat: "Heartbeat",
  watchdog_failures: "Failure Watchdog",
}

const normalizeWhitespace = (value: string): string => {
  return value.replace(/\s+/gu, " ").trim()
}

const truncate = (value: string, maxLength: number): string => {
  if (value.length <= maxLength) {
    return value
  }

  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`
}

/**
 * Builds a compact human-readable job label from raw scheduler task type text so long prompt
 * payloads do not dominate list and detail headers.
 *
 * @param type Raw task type text from persistence.
 * @returns Short display title appropriate for headings.
 */
export const getJobDisplayTitle = (type: string): string => {
  if (SYSTEM_JOB_TYPE_LABELS[type]) {
    return SYSTEM_JOB_TYPE_LABELS[type]
  }

  const normalized = normalizeWhitespace(type)
  if (normalized.length === 0) {
    return "Scheduled job"
  }

  const firstSentence = normalized.split(/[\n.]/u)[0]?.trim() ?? normalized
  return truncate(firstSentence, 96)
}

/**
 * Returns normalized full task definition text so detail pages can still expose the complete
 * job instruction safely inside bounded scroll containers.
 *
 * @param type Raw task type text.
 * @returns Normalized full task definition.
 */
export const getJobDefinitionText = (type: string): string => {
  const normalized = normalizeWhitespace(type)
  return normalized.length > 0 ? normalized : "No task definition available."
}
