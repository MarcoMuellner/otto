import { openCommandPalette } from "./events.js"

type CommandBarProps = {
  placeholder: string
  keyboardHint?: string
}

/**
 * Holds command-first entry treatment as an atomic component so every route can expose a
 * consistent operator launch surface before deeper interaction patterns are added.
 */
export const CommandBar = ({ placeholder, keyboardHint = "CMD+K" }: CommandBarProps) => {
  return (
    <button
      type="button"
      role="search"
      onClick={openCommandPalette}
      className="group relative flex min-h-14 w-full max-w-lg items-center rounded-2xl border border-[rgba(26,26,26,0.1)] bg-white p-2.5 text-left shadow-sm transition-all duration-300 hover:shadow-md active:scale-[0.99] md:p-2"
      aria-label="Open command palette"
    >
      <span
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center text-[#888888] md:h-11 md:w-11"
        aria-hidden="true"
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M13 10V3L4 14h7v7l9-11h-7z"
          />
        </svg>
      </span>
      <span className="flex-1 px-2 text-base font-light text-[rgba(136,136,136,0.72)] md:px-4 md:text-lg">
        {placeholder}
      </span>
      <span className="hidden pr-4 font-mono text-xs text-[rgba(136,136,136,0.5)] md:block">
        {keyboardHint}
      </span>
    </button>
  )
}
