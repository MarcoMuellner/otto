import type { SidebarsConfig } from "@docusaurus/plugin-content-docs"

const sidebars: SidebarsConfig = {
  docsSidebar: [
    "intro",
    {
      type: "category",
      label: "Concepts",
      items: ["concepts/overview"],
    },
    {
      type: "category",
      label: "Contracts",
      items: ["contracts/overview"],
    },
    {
      type: "category",
      label: "Operator Guide",
      items: [
        "operator-guide/overview",
        "operator-guide/setup-and-first-start",
        "operator-guide/notification-policy-and-watchdog-alerts",
        "operator-guide/service-lifecycle-and-health-checks",
        "operator-guide/update-workflow",
        "operator-guide/docs-platform-rollout-and-rollback",
        "operator-guide/docs-surface-static-vs-live",
        "operator-guide/incident-triage",
        "operator-guide/troubleshooting-runtime-state-and-processes",
        "operator-guide/troubleshooting-limits-and-pagination",
        "operator-guide/troubleshooting-auth-and-live-access",
      ],
    },
    {
      type: "category",
      label: "CLI Reference",
      items: [
        "cli-reference/overview",
        "cli-reference/lifecycle",
        "cli-reference/setup-and-config",
        "cli-reference/tasks",
        "cli-reference/models",
        "cli-reference/prompt",
        "cli-reference/extensions",
        "cli-reference/doctor",
        "cli-reference/update",
      ],
    },
    {
      type: "category",
      label: "API Reference",
      items: ["api-reference/overview"],
    },
    "contributing",
  ],
}

export default sidebars
