/**
 * Keeps the Paper Void ambient depth treatment in a dedicated atom so every surface can reuse
 * the same visual context without duplicating decorative markup in route files.
 */
export const AmbientRings = () => {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute top-[38%] left-[-34%] h-[34vh] w-[34vh] -translate-y-1/2 rounded-full border border-[#1a1a1a] opacity-[0.06] md:top-1/2 md:left-[5%] md:h-[60vh] md:w-[60vh] md:opacity-10 lg:left-[10%] motion-safe:animate-[cp-breathe-left_8s_ease-in-out_infinite] motion-reduce:animate-none" />
      <div className="absolute top-[38%] right-[-34%] h-[34vh] w-[34vh] -translate-y-1/2 rounded-full border border-[#1a1a1a] opacity-[0.06] md:top-1/2 md:right-[5%] md:h-[60vh] md:w-[60vh] md:opacity-10 lg:right-[10%] motion-safe:animate-[cp-breathe-right_8s_ease-in-out_infinite] motion-reduce:animate-none" />
    </div>
  )
}
