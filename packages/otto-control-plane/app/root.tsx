import type { LinksFunction } from "react-router"
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router"

import stylesheet from "./styles/control-plane.css?url"

export const links: LinksFunction = () => {
  return [
    {
      rel: "stylesheet",
      href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500&family=Inter:wght@200;300;400;500&display=swap",
    },
    { rel: "stylesheet", href: stylesheet },
  ]
}

export default function AppRoot() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="relative h-screen w-screen selection:bg-[rgba(26,26,26,0.1)] selection:text-[#1a1a1a]">
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  )
}
