export const OPEN_COMMAND_PALETTE_EVENT = "otto:open-command-palette"

/**
 * Broadcasts a global open-command-palette signal so atomic command entry components can trigger
 * the shared overlay without prop drilling through route/layout boundaries.
 */
export const openCommandPalette = (): void => {
  if (typeof window === "undefined") {
    return
  }

  window.dispatchEvent(new CustomEvent(OPEN_COMMAND_PALETTE_EVENT))
}
