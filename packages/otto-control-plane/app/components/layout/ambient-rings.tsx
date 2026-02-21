/**
 * Keeps the Paper Void ambient depth treatment in a dedicated atom so every surface can reuse
 * the same visual context without duplicating decorative markup in route files.
 */
export const AmbientRings = () => {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      <div className="absolute top-1/2 left-[-10vmin] h-[52vmin] w-[52vmin] -translate-y-1/2 rounded-full border border-[rgba(26,26,26,0.12)] motion-safe:animate-[cp-breathe_8s_ease-in-out_infinite] motion-reduce:animate-none" />
      <div className="absolute top-1/2 right-[-10vmin] h-[52vmin] w-[52vmin] -translate-y-1/2 rounded-full border border-[rgba(26,26,26,0.12)] [animation-delay:1.5s] motion-safe:animate-[cp-breathe_8s_ease-in-out_infinite] motion-reduce:animate-none" />
    </div>
  )
}
