import { useEffect, useMemo, useState } from "react"
import { Link, useLoaderData, useNavigation } from "react-router"

import { Button } from "../components/ui/button.js"
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card.js"
import {
  promptFileResponseSchema,
  promptFilesResponseSchema,
  updatePromptFileResponseSchema,
  type PromptFileEntry,
  type PromptFileResponse,
  type PromptProvenance,
  type RecentPromptProvenanceEntry,
} from "../features/prompts/contracts.js"
import { formatDateTime } from "../lib/date-time.js"
import { createOttoExternalApiClientFromEnvironment } from "../server/otto-external-api.server.js"

type PromptsLoaderData = {
  status: "success" | "error"
  message?: string
  files: PromptFileEntry[]
  interactiveProvenance: PromptProvenance | null
  recentProvenance: RecentPromptProvenanceEntry[]
}

const parseErrorMessage = (body: unknown, fallback: string): string => {
  if (body && typeof body === "object") {
    const candidate = body as {
      message?: unknown
      error?: unknown
    }

    if (typeof candidate.message === "string" && candidate.message.trim().length > 0) {
      return candidate.message
    }

    if (typeof candidate.error === "string" && candidate.error.trim().length > 0) {
      return candidate.error
    }
  }

  return fallback
}

const loadRecentPromptProvenance = async (limit = 8): Promise<RecentPromptProvenanceEntry[]> => {
  const client = await createOttoExternalApiClientFromEnvironment()
  const jobs = await client.listJobs({ lane: "scheduled" })

  const jobRuns = await Promise.all(
    jobs.jobs.map(async (job) => {
      try {
        const runs = await client.getJobRuns(job.id, { limit: 3, offset: 0 })
        return runs.runs
          .filter((run) => run.promptProvenance !== null)
          .map((run) => ({
            runId: run.id,
            jobId: job.id,
            jobType: job.type,
            startedAt: run.startedAt,
            status: run.status,
            provenance: run.promptProvenance!,
          }))
      } catch {
        return []
      }
    })
  )

  return jobRuns
    .flat()
    .sort((left, right) => right.startedAt - left.startedAt)
    .slice(0, limit)
}

export const loader = async (): Promise<PromptsLoaderData> => {
  try {
    const client = await createOttoExternalApiClientFromEnvironment()
    const [filesResponse, interactive, recentProvenance] = await Promise.all([
      client.listPromptFiles(),
      client.resolveInteractivePrompt("web"),
      loadRecentPromptProvenance(),
    ])

    return {
      status: "success",
      files: filesResponse.files,
      interactiveProvenance: interactive.provenance,
      recentProvenance,
    }
  } catch {
    return {
      status: "error",
      message: "Could not load prompt management data right now.",
      files: [],
      interactiveProvenance: null,
      recentProvenance: [],
    }
  }
}

const fetchPromptFiles = async (): Promise<PromptFileEntry[]> => {
  const response = await fetch("/api/prompts/files", { method: "GET" })
  const body = (await response.json()) as unknown
  if (!response.ok) {
    throw new Error(parseErrorMessage(body, "Could not load prompt inventory"))
  }

  return promptFilesResponseSchema.parse(body).files
}

const fetchPromptFile = async (input: {
  source: PromptFileEntry["source"]
  relativePath: string
}): Promise<PromptFileResponse["file"]> => {
  const searchParams = new URLSearchParams()
  searchParams.set("source", input.source)
  searchParams.set("path", input.relativePath)

  const response = await fetch(`/api/prompts/file?${searchParams.toString()}`, { method: "GET" })
  const body = (await response.json()) as unknown
  if (!response.ok) {
    throw new Error(parseErrorMessage(body, "Could not load prompt file"))
  }

  return promptFileResponseSchema.parse(body).file
}

const savePromptFile = async (input: {
  source: PromptFileEntry["source"]
  relativePath: string
  content: string
}): Promise<void> => {
  const response = await fetch("/api/prompts/file", {
    method: "PUT",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  })
  const body = (await response.json()) as unknown
  if (!response.ok) {
    throw new Error(parseErrorMessage(body, "Could not save prompt file"))
  }

  updatePromptFileResponseSchema.parse(body)
}

const renderProvenanceLayers = (provenance: PromptProvenance) => {
  return provenance.layers.map((layer) => {
    return (
      <li
        key={`${layer.layer}-${layer.path ?? "none"}`}
        className="list-none rounded border border-[rgba(26,26,26,0.08)] bg-[rgba(248,248,248,0.6)] px-2.5 py-2"
      >
        <p className="m-0 font-mono text-[10px] tracking-[0.08em] text-[#666666] uppercase">
          {layer.layer} • {layer.status}
        </p>
        <p className="m-0 mt-1 text-xs text-[#1a1a1a]">
          {layer.source ?? "none"}
          {layer.path ? ` / ${layer.path}` : ""}
        </p>
      </li>
    )
  })
}

export default function PromptsRoute() {
  const data = useLoaderData<typeof loader>()
  const navigation = useNavigation()
  const isNavigating = navigation.state !== "idle"

  const [files, setFiles] = useState<PromptFileEntry[]>(data.files)
  const [showSystemFiles, setShowSystemFiles] = useState(false)
  const [fileFilter, setFileFilter] = useState("")
  const [selectedKey, setSelectedKey] = useState<string | null>(
    (() => {
      const firstEditableFile = data.files.find((file) => file.editable)
      const fallbackFile = data.files[0]
      const candidate = firstEditableFile ?? fallbackFile
      return candidate ? `${candidate.source}:${candidate.relativePath}` : null
    })()
  )
  const [activeFile, setActiveFile] = useState<PromptFileResponse["file"] | null>(null)
  const [editorContent, setEditorContent] = useState("")
  const [originalContent, setOriginalContent] = useState("")
  const [loadingError, setLoadingError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isLoadingFile, setIsLoadingFile] = useState(false)
  const [isSavingFile, setIsSavingFile] = useState(false)

  const selectedFileEntry = useMemo(() => {
    if (!selectedKey) {
      return null
    }

    const [source, ...pathParts] = selectedKey.split(":")
    const relativePath = pathParts.join(":")
    if ((source !== "system" && source !== "user") || relativePath.length === 0) {
      return null
    }

    return {
      source,
      relativePath,
    } satisfies Pick<PromptFileEntry, "source" | "relativePath">
  }, [selectedKey])

  const hasUnsavedChanges = editorContent !== originalContent

  const normalizedFileFilter = fileFilter.trim().toLowerCase()

  const editableFiles = useMemo(() => {
    return files.filter((file) => {
      if (!file.editable) {
        return false
      }

      if (normalizedFileFilter.length === 0) {
        return true
      }

      return file.relativePath.toLowerCase().includes(normalizedFileFilter)
    })
  }, [files, normalizedFileFilter])

  const systemFiles = useMemo(() => {
    return files.filter((file) => {
      if (file.source !== "system") {
        return false
      }

      if (normalizedFileFilter.length === 0) {
        return true
      }

      return file.relativePath.toLowerCase().includes(normalizedFileFilter)
    })
  }, [files, normalizedFileFilter])

  const visibleFiles = useMemo(() => {
    if (showSystemFiles) {
      return [...editableFiles, ...systemFiles]
    }

    return editableFiles
  }, [editableFiles, showSystemFiles, systemFiles])

  const hasFilteredResults = useMemo(() => {
    if (showSystemFiles) {
      return editableFiles.length > 0 || systemFiles.length > 0
    }

    return editableFiles.length > 0
  }, [editableFiles.length, showSystemFiles, systemFiles.length])

  useEffect(() => {
    if (visibleFiles.length === 0) {
      setSelectedKey(null)
      return
    }

    const hasSelectedFile =
      selectedKey !== null &&
      visibleFiles.some((file) => `${file.source}:${file.relativePath}` === selectedKey)

    if (hasSelectedFile) {
      return
    }

    const candidate = visibleFiles[0]

    if (candidate) {
      setSelectedKey(`${candidate.source}:${candidate.relativePath}`)
    }
  }, [selectedKey, visibleFiles])

  const renderFileButton = (file: PromptFileEntry) => {
    const key = `${file.source}:${file.relativePath}`
    const isSelected = selectedKey === key
    const isSystemFile = file.source === "system"

    return (
      <button
        key={key}
        type="button"
        onClick={() => setSelectedKey(key)}
        className={`w-full rounded border px-2.5 py-2 text-left transition-colors ${
          isSelected
            ? isSystemFile
              ? "border-[rgba(161,98,7,0.45)] bg-[rgba(255,240,208,0.9)]"
              : "border-[rgba(26,26,26,0.22)] bg-[rgba(26,26,26,0.05)]"
            : isSystemFile
              ? "border-[rgba(161,98,7,0.22)] bg-[rgba(255,248,229,0.85)] hover:bg-[rgba(255,243,214,0.95)]"
              : "border-[rgba(26,26,26,0.08)] bg-white hover:bg-[rgba(26,26,26,0.03)]"
        }`}
      >
        <p className="m-0 text-sm text-[#1a1a1a]">{file.relativePath}</p>
        <p className="m-0 mt-1 font-mono text-[10px] tracking-[0.08em] text-[#777777] uppercase">
          {file.editable ? "editable" : "read-only"} | {file.source}
        </p>
      </button>
    )
  }

  useEffect(() => {
    setFiles(data.files)
  }, [data.files])

  useEffect(() => {
    if (!selectedFileEntry) {
      setActiveFile(null)
      setEditorContent("")
      setOriginalContent("")
      return
    }

    let cancelled = false

    const run = async () => {
      setIsLoadingFile(true)
      setLoadingError(null)
      setSaveError(null)
      try {
        const file = await fetchPromptFile(selectedFileEntry)
        if (cancelled) {
          return
        }

        setActiveFile(file)
        setEditorContent(file.content)
        setOriginalContent(file.content)
      } catch (error) {
        if (!cancelled) {
          setActiveFile(null)
          setEditorContent("")
          setOriginalContent("")
          setLoadingError(error instanceof Error ? error.message : "Could not load prompt file")
        }
      } finally {
        if (!cancelled) {
          setIsLoadingFile(false)
        }
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [selectedFileEntry])

  const handleSave = async () => {
    if (!activeFile || !activeFile.editable || isSavingFile || !hasUnsavedChanges) {
      return
    }

    setIsSavingFile(true)
    setSaveError(null)
    try {
      await savePromptFile({
        source: activeFile.source,
        relativePath: activeFile.relativePath,
        content: editorContent,
      })

      setOriginalContent(editorContent)
      const latestFiles = await fetchPromptFiles()
      setFiles(latestFiles)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save prompt file")
    } finally {
      setIsSavingFile(false)
    }
  }

  return (
    <section className="mx-auto flex min-h-[calc(100dvh-5rem)] w-full max-w-6xl flex-col px-2 pb-4 pt-2 max-[720px]:min-h-[calc(100dvh-4.6rem)]">
      <header className="mb-3 flex items-end justify-between gap-2 border-b border-[rgba(26,26,26,0.08)] pb-3">
        <div>
          <p className="mb-1 font-mono text-[11px] tracking-[0.16em] text-[#888888] uppercase">
            Prompts
          </p>
          <h1 className="m-0 text-3xl leading-tight font-light text-[#1a1a1a] max-[720px]:text-[1.9rem]">
            Prompt Management
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/" className="inline-flex">
            <Button variant="outline" size="sm">
              Home
            </Button>
          </Link>
        </div>
      </header>

      {data.status === "error" ? (
        <Card className="mb-3 border-[rgba(235,59,59,0.2)] bg-[rgba(255,247,247,0.9)]">
          <CardContent className="pt-5">
            <p className="m-0 text-sm text-[#9f2424]">{data.message}</p>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Card className="flex min-h-0 flex-col overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle>Files</CardTitle>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col gap-2 pb-4">
            <input
              type="search"
              value={fileFilter}
              onChange={(event) => setFileFilter(event.target.value)}
              placeholder="Search files"
              className="w-full rounded border border-[rgba(26,26,26,0.12)] bg-white px-2.5 py-2 text-sm text-[#1a1a1a]"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowSystemFiles((current) => !current)}
            >
              {showSystemFiles ? "Hide read-only system files" : "Show read-only system files"}
            </Button>
            <p className="m-0 text-xs text-[#666666]">
              {editableFiles.length} editable{editableFiles.length === 1 ? "" : "s"}
              {showSystemFiles
                ? `, ${systemFiles.length} system file${systemFiles.length === 1 ? "" : "s"}`
                : ""}
            </p>
            <div className="hide-scrollbar min-h-0 flex-1 overflow-y-auto pr-1 pb-2">
              {!hasFilteredResults ? (
                <p className="m-0 text-sm text-[#777777]">No files match this filter.</p>
              ) : (
                <div className="space-y-3">
                  {editableFiles.length > 0 ? (
                    <section className="space-y-2">
                      <p className="m-0 font-mono text-[10px] tracking-[0.08em] text-[#777777] uppercase">
                        Editable prompts
                      </p>
                      <div className="space-y-2">
                        {editableFiles.map((file) => renderFileButton(file))}
                      </div>
                    </section>
                  ) : null}

                  {showSystemFiles && systemFiles.length > 0 ? (
                    <section className="space-y-2">
                      <p className="m-0 font-mono text-[10px] tracking-[0.08em] text-[#a16207] uppercase">
                        System prompts (read-only)
                      </p>
                      <div className="space-y-2">
                        {systemFiles.map((file) => renderFileButton(file))}
                      </div>
                    </section>
                  ) : null}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="grid min-h-0 grid-cols-1 gap-3">
          <Card className="min-h-0">
            <CardHeader className="pb-2">
              <CardTitle>Prompt Editor</CardTitle>
            </CardHeader>
            <CardContent className="grid min-h-0 gap-2">
              {activeFile ? (
                <p className="m-0 text-xs text-[#666666]">
                  <span className="font-mono text-[#1a1a1a]">{activeFile.relativePath}</span> |{" "}
                  {activeFile.editable ? "editable" : "read-only system file"}
                </p>
              ) : null}
              {isNavigating ? <p className="m-0 text-xs text-[#888888]">Refreshing...</p> : null}
              {loadingError ? <p className="m-0 text-sm text-[#b42318]">{loadingError}</p> : null}
              {saveError ? <p className="m-0 text-sm text-[#b42318]">{saveError}</p> : null}
              {activeFile && !activeFile.editable ? (
                <p className="m-0 text-xs text-[#666666]">
                  This is a system-owned prompt file and is read-only in control plane.
                </p>
              ) : null}
              <textarea
                value={editorContent}
                onChange={(event) => setEditorContent(event.target.value)}
                readOnly={Boolean(activeFile && !activeFile.editable)}
                placeholder={isLoadingFile ? "Loading prompt..." : "Select a prompt file"}
                className="hide-scrollbar min-h-[320px] w-full flex-1 resize-none rounded-lg border border-[rgba(26,26,26,0.12)] bg-[rgba(255,255,255,0.9)] px-3 py-2 font-mono text-xs leading-relaxed text-[#1a1a1a]"
              />
              {activeFile?.editable ? (
                <div className="flex items-center justify-between gap-2">
                  <p className="m-0 text-xs text-[#666666]">
                    {hasUnsavedChanges ? "Unsaved changes" : "No pending changes"}
                  </p>
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!hasUnsavedChanges || isSavingFile}
                      onClick={() => setEditorContent(originalContent)}
                    >
                      Revert
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={!hasUnsavedChanges || isSavingFile}
                      onClick={() => void handleSave()}
                    >
                      {isSavingFile ? "Saving..." : "Save"}
                    </Button>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Diagnostics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <details>
                <summary className="cursor-pointer text-sm text-[#1a1a1a]">
                  Effective chain (web interactive)
                </summary>
                <div className="mt-2">
                  {data.interactiveProvenance ? (
                    <>
                      <p className="m-0 text-sm text-[#1a1a1a]">
                        Flow <span className="font-mono">{data.interactiveProvenance.flow}</span> |
                        media <span className="font-mono">{data.interactiveProvenance.media}</span>
                      </p>
                      <ul className="mt-2 grid grid-cols-1 gap-2 p-0">
                        {renderProvenanceLayers(data.interactiveProvenance)}
                      </ul>
                    </>
                  ) : (
                    <p className="m-0 text-sm text-[#777777]">
                      Interactive prompt provenance unavailable.
                    </p>
                  )}
                </div>
              </details>

              <details>
                <summary className="cursor-pointer text-sm text-[#1a1a1a]">
                  Recent executions
                </summary>
                <div className="hide-scrollbar mt-2 max-h-[44dvh] space-y-2 overflow-y-auto pr-1">
                  {data.recentProvenance.length === 0 ? (
                    <p className="m-0 text-sm text-[#777777]">
                      No recent runs with prompt provenance.
                    </p>
                  ) : (
                    data.recentProvenance.map((entry) => (
                      <div
                        key={`${entry.jobId}:${entry.runId}`}
                        className="rounded border border-[rgba(26,26,26,0.08)] bg-[rgba(248,248,248,0.6)] px-2.5 py-2"
                      >
                        <p className="m-0 text-xs text-[#1a1a1a]">
                          <span className="font-mono">{entry.jobType}</span> | {entry.status} |{" "}
                          {formatDateTime(entry.startedAt)}
                        </p>
                        <p className="m-0 mt-1 font-mono text-[11px] text-[#666666]">
                          {entry.provenance.flow} ({entry.provenance.media ?? "n/a"})
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </details>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  )
}
