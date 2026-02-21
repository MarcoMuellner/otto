import { forwardRef, type ButtonHTMLAttributes } from "react"

import { cn } from "../../lib/cn.js"

type ButtonVariant = "default" | "outline"
type ButtonSize = "sm" | "md"

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
}

const variantClassByType: Record<ButtonVariant, string> = {
  default: "bg-[#1a1a1a] text-white hover:bg-black",
  outline: "border-[rgba(26,26,26,0.14)] bg-white text-[#1a1a1a] hover:bg-[rgba(26,26,26,0.04)]",
}

const sizeClassByType: Record<ButtonSize, string> = {
  sm: "px-3 py-2 text-xs",
  md: "px-3.5 py-2.5 text-[0.85rem]",
}

const baseClasses =
  "inline-flex items-center justify-center rounded-[10px] border border-transparent font-mono uppercase tracking-[0.09em] transition-[opacity,background-color,color,border-color] duration-150 disabled:cursor-default disabled:opacity-60"

/**
 * Provides a small shadcn-style button primitive so action controls remain consistent across
 * pages while the Paper Void visual treatment stays centralized in stylesheet tokens.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "md", type = "button", ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(baseClasses, variantClassByType[variant], sizeClassByType[size], className)}
        {...props}
      />
    )
  }
)

Button.displayName = "Button"
