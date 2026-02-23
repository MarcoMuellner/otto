import { cn } from "../../lib/cn.js"

type SwitchProps = {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  label: string
  description?: string
  className?: string
  size?: "default" | "compact"
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
  size = "default",
}: SwitchProps) => {
  const isCompact = size === "compact"

  return (
    <label
      className={cn(
        "flex items-center justify-between rounded-xl border border-[rgba(26,26,26,0.08)] bg-white",
        isCompact ? "gap-2 px-2.5 py-2" : "gap-4 px-3 py-2.5",
        className
      )}
    >
      <span className="min-w-0">
        <span
          className={cn(
            "block font-medium text-[#1a1a1a]",
            isCompact ? "text-[0.9rem] leading-5 whitespace-nowrap" : "text-[0.95rem] leading-6"
          )}
        >
          {label}
        </span>
        {description ? (
          <span className={cn("block text-[#888888]", isCompact ? "text-[11px]" : "text-xs")}>
            {description}
          </span>
        ) : null}
      </span>

      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          "relative inline-flex shrink-0 items-center rounded-full transition-colors duration-200",
          isCompact ? "h-6 w-10 p-[2px]" : "h-11 w-14 p-1",
          checked
            ? isCompact
              ? "bg-[rgba(26,26,26,0.82)]"
              : "bg-[#1a1a1a]"
            : "bg-[rgba(26,26,26,0.16)]"
        )}
      >
        <span
          className={cn(
            "inline-block transform rounded-full bg-white transition-transform duration-200",
            isCompact ? "h-3.5 w-3.5" : "h-5 w-5",
            checked ? (isCompact ? "translate-x-[18px]" : "translate-x-7") : "translate-x-0"
          )}
        />
      </button>
    </label>
  )
}
