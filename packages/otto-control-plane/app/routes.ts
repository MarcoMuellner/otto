import { index, layout, route, type RouteConfig } from "@react-router/dev/routes"

export default [
  layout("routes/_layout.tsx", [
    index("routes/home.tsx"),
    route("jobs", "routes/jobs.tsx"),
    route("jobs/:jobId", "routes/jobs.$jobId.tsx"),
  ]),
  route("api/health", "routes/api.health.ts"),
  route("api/jobs", "routes/api.jobs.ts"),
  route("api/jobs/:jobId", "routes/api.jobs.$jobId.ts"),
  route("api/jobs/:jobId/audit", "routes/api.jobs.$jobId.audit.ts"),
] satisfies RouteConfig
