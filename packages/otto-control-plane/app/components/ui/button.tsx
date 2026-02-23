import { forwardRef, type ButtonHTMLAttributes } from "react"

import { cn } from "../../lib/cn.js"

type ButtonVariant = "default" | "outline"
type ButtonSize = "sm" | "md"

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
}

const variantClassByType: Record<ButtonVariant, string> = {
  default:
    "border-[rgba(0,0,0,0.68)] bg-[#1a1a1a] text-white shadow-[0_1px_0_rgba(255,255,255,0.06)_inset] hover:bg-black",
  outline:
    "border-[rgba(26,26,26,0.34)] bg-white text-[#1a1a1a] shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:bg-[rgba(26,26,26,0.04)]",
}

const sizeClassByType: Record<ButtonSize, string> = {
  sm: "h-11 px-3.5 text-xs",
  md: "h-11 px-4 text-[0.85rem]",
}

const baseClasses =
  "inline-flex min-w-11 touch-manipulation items-center justify-center rounded-[10px] border font-mono uppercase tracking-[0.09em] transition-[opacity,background-color,color,border-color,box-shadow] duration-150 disabled:cursor-default disabled:opacity-60"

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
