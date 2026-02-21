type CommandBarProps = {
  placeholder: string
}

/**
 * Holds command-first entry treatment as an atomic component so every route can expose a
 * consistent operator launch surface before deeper interaction patterns are added.
 */
export const CommandBar = ({ placeholder }: CommandBarProps) => {
  return (
    <div
      className="mb-[18px] grid grid-cols-[auto_1fr] items-center gap-3 rounded-[14px] border border-[rgba(26,26,26,0.12)] bg-white px-3.5 py-2.5"
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
  )
}
