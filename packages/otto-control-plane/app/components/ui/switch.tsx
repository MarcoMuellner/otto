import { cn } from "../../lib/cn.js"

type SwitchProps = {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  label: string
  description?: string
  className?: string
}

/**
 * Provides a lightweight shadcn-style switch primitive so filter toggles remain consistent and
 * can be reused across control-plane screens.
 */
export const Switch = ({
  checked,
  onCheckedChange,
  label,
  description,
  className,
}: SwitchProps) => {
  return (
    <label
      className={cn(
        "flex items-center justify-between gap-4 rounded-xl border border-[rgba(26,26,26,0.08)] bg-white px-3 py-2",
        className
      )}
    >
      <span className="min-w-0">
        <span className="block whitespace-nowrap text-[0.95rem] font-medium text-[#1a1a1a]">
          {label}
        </span>
        {description ? <span className="block text-xs text-[#888888]">{description}</span> : null}
      </span>

      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          "relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200",
          checked ? "bg-[#1a1a1a]" : "bg-[rgba(26,26,26,0.16)]"
        )}
      >
        <span
          className={cn(
            "inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200",
            checked ? "translate-x-6" : "translate-x-1"
          )}
        />
      </button>
    </label>
  )
}
