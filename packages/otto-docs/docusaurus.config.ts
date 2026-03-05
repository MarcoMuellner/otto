import type { Config } from "@docusaurus/types"
import type * as Preset from "@docusaurus/preset-classic"
import { themes as prismThemes } from "prism-react-renderer"

const docsVersion = process.env.OTTO_DOCS_VERSION ?? "local-dev"
const docsTag = process.env.OTTO_DOCS_TAG ?? `v${docsVersion}`
const baseUrl = process.env.OTTO_DOCS_BASE_URL ?? "/"
const siteUrl = process.env.OTTO_DOCS_SITE_URL ?? "https://example.com"

const config: Config = {
  title: "Otto Docs",
  tagline: "Operator-first documentation for Otto runtime and platform",
  favicon: "img/otto-mark.svg",

  url: siteUrl,
  baseUrl,

  organizationName: "otto",
  projectName: "otto-docs",

  onBrokenLinks: "throw",

  markdown: {
    hooks: {
      onBrokenMarkdownLinks: "throw",
    },
  },

  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },

  customFields: {
    docsVersion,
    docsTag,
  },

  presets: [
    [
      "classic",
      {
        docs: {
          path: "docs",
          routeBasePath: "docs",
          sidebarPath: "./sidebars.ts",
          showLastUpdateAuthor: false,
          showLastUpdateTime: false,
        },
        blog: false,
        theme: {
          customCss: "./src/css/custom.css",
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: "img/otto-mark.svg",
    colorMode: {
      defaultMode: "light",
      disableSwitch: true,
      respectPrefersColorScheme: false,
    },
    navbar: {
      title: "Otto Docs",
      hideOnScroll: true,
      items: [
        {
          to: "/docs/concepts/overview",
          label: "Concepts",
          position: "left",
        },
        {
          to: "/docs/contracts/overview",
          label: "Contracts",
          position: "left",
        },
        {
          to: "/docs/operator-guide/overview",
          label: "Operator Guide",
          position: "left",
        },
        {
          to: "/docs/cli-reference/overview",
          label: "CLI Reference",
          position: "left",
        },
        {
          to: "/docs/api-reference/overview",
          label: "API Reference",
          position: "left",
        },
        {
          to: "/docs/contributing",
          label: "Contributing",
          position: "right",
        },
      ],
    },
    docs: {
      sidebar: {
        hideable: true,
        autoCollapseCategories: false,
      },
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "Documentation",
          items: [
            {
              label: "Operator Guide",
              to: "/docs/operator-guide/overview",
            },
            {
              label: "CLI Reference",
              to: "/docs/cli-reference/overview",
            },
            {
              label: "API Reference",
              to: "/docs/api-reference/overview",
            },
          ],
        },
      ],
      copyright: `Copyright ${new Date().getFullYear()} Otto`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.vsDark,
      additionalLanguages: ["bash", "json", "yaml"],
    },
    tableOfContents: {
      minHeadingLevel: 2,
      maxHeadingLevel: 3,
    },
  } satisfies Preset.ThemeConfig,
}

export default config
