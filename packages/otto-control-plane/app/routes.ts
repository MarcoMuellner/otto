import { index, layout, route, type RouteConfig } from "@react-router/dev/routes"

export default [
  layout("routes/_layout.tsx", [index("routes/home.tsx")]),
  route("api/health", "routes/api.health.ts"),
  route("api/jobs", "routes/api.jobs.ts"),
] satisfies RouteConfig
