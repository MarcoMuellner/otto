import { useEffect, useState } from "react"
import { Outlet, useLocation, useNavigate } from "react-router"

import { CommandPalette } from "../components/command/command-palette.js"
import { OPEN_COMMAND_PALETTE_EVENT } from "../components/command/events.js"
import { AmbientRings } from "../components/layout/ambient-rings.js"

const resolveEscapeTarget = (pathname: string): string | null => {
  if (pathname === "/") {
    return null
  }

  if (pathname.startsWith("/jobs/")) {
    return "/jobs"
  }

  return "/"
}

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  const tagName = target.tagName
  return (
    target.isContentEditable ||
    tagName === "INPUT" ||
    tagName === "TEXTAREA" ||
    tagName === "SELECT"
  )
}

export default function LayoutRoute() {
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const isChatRoute = location.pathname === "/chat"

  useEffect(() => {
    const openPalette = (): void => {
      setIsCommandPaletteOpen(true)
    }

    const closePalette = (): void => {
      setIsCommandPaletteOpen(false)
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        openPalette()
        return
      }

      if (event.key === "Escape") {
        if (isCommandPaletteOpen) {
          event.preventDefault()
          closePalette()
          return
        }

        if (isEditableTarget(event.target)) {
          return
        }

        const escapeTarget = resolveEscapeTarget(location.pathname)
        if (!escapeTarget) {
          return
        }

        event.preventDefault()
        navigate(escapeTarget)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, openPalette)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, openPalette)
    }
  }, [isCommandPaletteOpen, location.pathname, navigate])

  return (
    <main
      className={`relative flex overflow-hidden ${
        isChatRoute
          ? "h-dvh justify-stretch px-2 py-3 max-[720px]:px-2 max-[720px]:py-2"
          : "min-h-dvh justify-center px-5 py-8 max-[720px]:px-3.5 max-[720px]:py-[18px]"
      }`}
    >
      <AmbientRings />
      <section
        className={`relative z-[1] w-full ${isChatRoute ? "flex min-h-0 flex-1 max-w-none" : ""}`}
      >
        <Outlet />
      </section>
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
      />
    </main>
  )
}
