export type CommandActionGroup = "jump" | "quick"
export type CommandActionIcon = "jobs" | "home" | "chat" | "system" | "settings" | "audit"
export type CommandActionTone = "neutral" | "success" | "info"

export type CommandAction = {
  id: string
  label: string
  subtitle: string
  group: CommandActionGroup
  icon: CommandActionIcon
  tone?: CommandActionTone
  shortcut?: string
  to?: string
  disabled?: boolean
}

/**
 * Defines control-plane command palette actions in one central list so keyboard navigation,
 * command-bar UX, and future shortcuts stay synchronized.
 */
export const commandActions: CommandAction[] = [
  {
    id: "jump-jobs",
    label: "Job Queue",
    subtitle: "Inspect scheduled, system, and background tasks",
    group: "jump",
    icon: "jobs",
    shortcut: "G J",
    to: "/jobs",
  },
  {
    id: "jump-home",
    label: "Zen Home",
    subtitle: "Return to command center",
    group: "jump",
    icon: "home",
    shortcut: "G H",
    to: "/",
  },
  {
    id: "jump-chat",
    label: "Chat with Otto",
    subtitle: "Open operator chat threads",
    group: "jump",
    icon: "chat",
    shortcut: "G C",
    to: "/chat",
  },
  {
    id: "quick-system",
    label: "System Status",
    subtitle: "Runtime and service health operations",
    group: "quick",
    icon: "system",
    tone: "success",
    to: "/system",
  },
  {
    id: "quick-settings",
    label: "Settings",
    subtitle: "Notification profile and safe runtime settings",
    group: "quick",
    icon: "settings",
    tone: "info",
    to: "/settings",
  },
  {
    id: "quick-audit",
    label: "Audit Trail",
    subtitle: "Execution and command history",
    group: "quick",
    icon: "audit",
    disabled: true,
  },
]
