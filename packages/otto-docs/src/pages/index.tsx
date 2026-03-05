import Link from "@docusaurus/Link"
import useDocusaurusContext from "@docusaurus/useDocusaurusContext"
import Layout from "@theme/Layout"

const sections = [
  {
    title: "Concepts",
    description: "Runtime model, decision boundaries, and shared language.",
    to: "/docs/concepts/overview",
  },
  {
    title: "Contracts",
    description: "Version-bound schemas, behavior guarantees, and invariants.",
    to: "/docs/contracts/overview",
  },
  {
    title: "Operator Guide",
    description: "Runbooks for setup, operations, and recovery.",
    to: "/docs/operator-guide/overview",
  },
  {
    title: "CLI Reference",
    description: "`ottoctl` command behavior, flags, and examples.",
    to: "/docs/cli-reference/overview",
  },
  {
    title: "API Reference",
    description: "External API semantics and OpenAPI-backed contracts.",
    to: "/docs/api-reference/overview",
  },
]

export default function HomePage(): JSX.Element {
  const { siteConfig } = useDocusaurusContext()
  const docsTag = String(siteConfig.customFields?.docsTag ?? "vlocal-dev")

  return (
    <Layout
      title="Otto Docs"
      description="Operator-first docs for runtime behavior, contracts, and operations"
    >
      <main className="docs-homepage">
        <section className="docs-home-hero">
          <div className="docs-home-hero__inner container">
            <p className="docs-home-kicker">Otto operator docs</p>
            <h1>Clear runtime truth, one place</h1>
            <p>
              This docs platform is the operator-first source of truth for how Otto works, what
              constraints apply, and how to run it safely.
            </p>
            <p className="docs-home-version-chip">Release docs version: {docsTag}</p>
            <div className="docs-home-actions">
              <Link className="button button--primary button--lg" to="/docs/intro">
                Start With Intro
              </Link>
              <Link className="button button--secondary button--lg" to="/docs/contributing">
                Writing Conventions
              </Link>
            </div>
          </div>
        </section>

        <section className="docs-home-grid container" aria-label="Documentation sections">
          {sections.map((section) => (
            <Link key={section.title} className="docs-home-card" to={section.to}>
              <h2>{section.title}</h2>
              <p>{section.description}</p>
            </Link>
          ))}
        </section>
      </main>
    </Layout>
  )
}
