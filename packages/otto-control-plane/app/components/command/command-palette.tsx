import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { useLocation, useNavigate } from "react-router"

import {
  commandActions,
  type CommandAction,
  type CommandActionIcon,
} from "../../features/navigation/command-actions.js"

type CommandPaletteProps = {
  isOpen: boolean
  onClose: () => void
}

const normalize = (value: string): string => value.trim().toLowerCase()

const resolveIconContainerClass = (action: CommandAction): string => {
  if (action.tone === "success") {
    return "bg-[rgba(16,185,129,0.12)] text-[#059669]"
  }

  if (action.tone === "info") {
    return "bg-[rgba(37,99,235,0.12)] text-[#2563eb]"
  }

  return "bg-[rgba(26,26,26,0.06)] text-[#888888]"
}

const ActionIcon = ({ icon }: { icon: CommandActionIcon }) => {
  if (icon === "jobs") {
    return (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2"
        />
      </svg>
    )
  }

  if (icon === "home") {
    return (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M3 12l9-9 9 9m-2 0v8a1 1 0 01-1 1h-4v-6H10v6H6a1 1 0 01-1-1v-8"
        />
      </svg>
    )
  }

  if (icon === "chat") {
    return (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M8 10h.01M12 10h.01M16 10h.01M21 12a9 9 0 01-9 9 8.98 8.98 0 01-4.286-1.073L3 21l1.073-4.714A9 9 0 1121 12z"
        />
      </svg>
    )
  }

  if (icon === "system") {
    return (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    )
  }

  if (icon === "settings") {
    return (
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
        />
      </svg>
    )
  }

  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M9 12h6m-6 4h6M9 8h.01"
      />
    </svg>
  )
}

/**
 * Renders the global command palette overlay so operators can navigate between control-plane
 * surfaces with keyboard-first interactions aligned to the design prototype.
 */
export const CommandPalette = ({ isOpen, onClose }: CommandPaletteProps) => {
  const navigate = useNavigate()
  const location = useLocation()
  const [query, setQuery] = useState("")
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isOpen) {
      setQuery("")
      setSelectedIndex(0)
      return
    }

    const handle = window.setTimeout(() => {
      inputRef.current?.focus()
    }, 0)

    return () => {
      window.clearTimeout(handle)
    }
  }, [isOpen])

  const filteredActions = useMemo(() => {
    const keyword = normalize(query)
    if (!keyword) {
      return commandActions
    }

    return commandActions.filter((action) => {
      const haystack = `${action.label} ${action.subtitle} ${action.shortcut ?? ""}`
      return normalize(haystack).includes(keyword)
    })
  }, [query])

  useEffect(() => {
    setSelectedIndex((current) => {
      if (filteredActions.length === 0) {
        return 0
      }

      return Math.min(current, filteredActions.length - 1)
    })
  }, [filteredActions])

  const activeAction = filteredActions[selectedIndex]

  const triggerAction = (actionId: string): void => {
    const action = filteredActions.find((entry) => entry.id === actionId)
    if (!action || action.disabled || !action.to) {
      return
    }

    if (location.pathname !== action.to) {
      navigate(action.to)
    }
    onClose()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setSelectedIndex((current) => {
        if (filteredActions.length === 0) {
          return 0
        }
        return (current + 1) % filteredActions.length
      })
      return
    }

    if (event.key === "ArrowUp") {
      event.preventDefault()
      setSelectedIndex((current) => {
        if (filteredActions.length === 0) {
          return 0
        }
        return (current - 1 + filteredActions.length) % filteredActions.length
      })
      return
    }

    if (event.key === "Enter") {
      event.preventDefault()
      if (!activeAction) {
        return
      }
      triggerAction(activeAction.id)
    }
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end px-0 transition-opacity duration-200 md:items-start md:justify-center md:px-4 md:pt-[20vh] ${
        isOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
      }`}
      aria-hidden={!isOpen}
    >
      <button
        type="button"
        aria-label="Close command palette"
        className="absolute inset-0 bg-[rgba(248,248,248,0.82)] backdrop-blur-sm"
        onClick={onClose}
      />

      <section
        className={`relative flex h-dvh w-full flex-col overflow-hidden rounded-none border border-[rgba(26,26,26,0.08)] bg-white shadow-2xl transition-transform duration-300 md:mx-auto md:h-auto md:max-h-[75vh] md:max-w-xl md:rounded-2xl ${
          isOpen ? "translate-y-0 md:scale-100" : "translate-y-full md:scale-95"
        }`}
      >
        <div className="sticky top-0 z-10 flex items-center border-b border-[rgba(26,26,26,0.08)] bg-white px-3 py-3 md:px-4 md:py-4">
          <span className="mr-3 text-[#888888]" aria-hidden="true">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M21 21l-4.35-4.35m1.85-5.15a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </span>
          <input
            id="command-palette-input"
            name="command-palette"
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="What would you like to do?"
            className="h-11 flex-1 border-none bg-transparent p-0 text-base leading-6 font-light text-[#1a1a1a] outline-none placeholder:text-[rgba(136,136,136,0.6)] md:text-xl md:leading-7"
          />
          <button
            type="button"
            onClick={onClose}
            className="ml-2 inline-flex h-11 w-11 items-center justify-center rounded border border-[rgba(26,26,26,0.12)] text-[#888888] md:hidden"
            aria-label="Close command palette"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
          <span className="hidden rounded border border-[rgba(26,26,26,0.12)] px-1.5 py-0.5 font-mono text-[10px] text-[#888888] md:inline-flex">
            ESC
          </span>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {[
            { label: "Jump to", group: "jump" as const },
            { label: "Quick actions", group: "quick" as const },
          ].map((section) => {
            const entries = filteredActions.filter((entry) => entry.group === section.group)
            if (entries.length === 0) {
              return null
            }

            return (
              <div key={section.group}>
                <p className="px-4 py-2 font-mono text-[10px] tracking-[0.12em] text-[rgba(136,136,136,0.7)] uppercase">
                  {section.label}
                </p>
                {entries.map((action) => {
                  const isSelected = activeAction?.id === action.id

                  return (
                    <button
                      key={action.id}
                      type="button"
                      disabled={action.disabled}
                      onClick={() => triggerAction(action.id)}
                      className={`flex w-full items-center justify-between px-4 py-3.5 text-left transition-colors ${
                        isSelected ? "bg-[rgba(26,26,26,0.06)]" : "hover:bg-[rgba(26,26,26,0.04)]"
                      } ${action.disabled ? "cursor-not-allowed opacity-55" : ""}`}
                    >
                      <span className="flex items-center gap-3">
                        <span
                          className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${resolveIconContainerClass(
                            action
                          )}`}
                        >
                          <ActionIcon icon={action.icon} />
                        </span>
                        <span className="block text-[1.05rem] font-light leading-6 text-[#1a1a1a] md:text-base md:leading-6">
                          {action.label}
                        </span>
                      </span>
                      <span className="hidden font-mono text-[11px] tracking-[0.08em] text-[#888888] uppercase md:block">
                        {action.shortcut ?? (action.disabled ? "Soon" : "")}
                      </span>
                    </button>
                  )
                })}
              </div>
            )
          })}

          {filteredActions.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-[#888888]">No matching actions.</p>
          ) : null}
        </div>
      </section>
    </div>
  )
}
