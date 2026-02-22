import { Toaster as Sonner, type ToasterProps } from "sonner"

/**
 * Provides a themed Sonner toaster aligned with the control-plane surface so route-level
 * mutations can emit persistent feedback without bespoke alert state.
 */
export const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      richColors
      position="top-right"
      toastOptions={{
        className:
          "border border-[rgba(26,26,26,0.14)] bg-white text-[#1a1a1a] font-mono text-xs uppercase tracking-[0.06em]",
      }}
      {...props}
    />
  )
}
