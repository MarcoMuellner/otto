import { Outlet } from "react-router"

import { AmbientRings } from "../components/layout/ambient-rings.js"

export default function LayoutRoute() {
  return (
    <main className="relative flex min-h-dvh justify-center overflow-hidden px-5 py-8 max-[720px]:px-3.5 max-[720px]:py-[18px]">
      <AmbientRings />
      <section className="relative z-[1] w-full max-w-[720px]">
        <Outlet />
      </section>
    </main>
  )
}
