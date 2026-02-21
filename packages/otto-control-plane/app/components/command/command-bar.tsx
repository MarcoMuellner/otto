import { Link } from "react-router"

type CommandBarProps = {
  placeholder: string
  entries?: Array<{
    label: string
    to: string
  }>
}

/**
 * Holds command-first entry treatment as an atomic component so every route can expose a
 * consistent operator launch surface before deeper interaction patterns are added.
 */
export const CommandBar = ({ placeholder, entries = [] }: CommandBarProps) => {
  return (
    <section className="mb-[18px] space-y-3">
      <div
        className="grid grid-cols-[auto_1fr] items-center gap-3 rounded-[14px] border border-[rgba(26,26,26,0.12)] bg-white px-3.5 py-2.5"
        role="search"
      >
        <span className="font-mono text-[0.85rem] text-[#888888]" aria-hidden="true">
          //
        </span>
        <input
          value={placeholder}
          readOnly
          aria-label="Command bar"
          className="border-none bg-transparent p-0 text-base text-[rgba(26,26,26,0.76)]"
        />
      </div>

      {entries.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {entries.map((entry) => (
            <Link
              key={entry.to}
              to={entry.to}
              className="rounded-full border border-[rgba(26,26,26,0.12)] bg-white px-3 py-1.5 text-xs font-mono tracking-[0.06em] text-[#1a1a1a] uppercase hover:bg-[rgba(26,26,26,0.04)]"
            >
              {entry.label}
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  )
}
