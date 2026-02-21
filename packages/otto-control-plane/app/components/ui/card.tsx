import { forwardRef, type HTMLAttributes } from "react"

import { cn } from "../../lib/cn.js"

/**
 * Provides shadcn-style card primitives adapted to Otto's Paper Void theme so screens can be
 * composed from reusable structural atoms instead of one-off containers.
 */
export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("rounded-[14px] border border-[rgba(26,26,26,0.12)] bg-white", className)}
        {...props}
      />
    )
  }
)

Card.displayName = "Card"

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("px-[18px] pt-4 pb-2.5", className)} {...props} />
  }
)

CardHeader.displayName = "CardHeader"

export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => {
    return (
      <h3
        ref={ref}
        className={cn("mt-0.5 text-xl font-medium leading-tight", className)}
        {...props}
      />
    )
  }
)

CardTitle.displayName = "CardTitle"

export const CardDescription = forwardRef<
  HTMLParagraphElement,
  HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => {
  return (
    <p
      ref={ref}
      className={cn("m-0 font-mono text-xs tracking-[0.12em] text-[#888888] uppercase", className)}
      {...props}
    />
  )
})

CardDescription.displayName = "CardDescription"

export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("px-[18px]", className)} {...props} />
  }
)

CardContent.displayName = "CardContent"

export const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return <div ref={ref} className={cn("px-[18px] pt-2.5 pb-4", className)} {...props} />
  }
)

CardFooter.displayName = "CardFooter"
