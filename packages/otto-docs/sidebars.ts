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
      items: ["operator-guide/overview"],
    },
    {
      type: "category",
      label: "CLI Reference",
      items: ["cli-reference/overview"],
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
