import type { LinksFunction } from "react-router"
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router"

import stylesheet from "./styles/control-plane.css?url"

export const links: LinksFunction = () => {
  return [{ rel: "stylesheet", href: stylesheet }]
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
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  )
}
