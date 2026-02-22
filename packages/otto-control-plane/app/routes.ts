import { index, layout, route, type RouteConfig } from "@react-router/dev/routes"

export default [
  layout("routes/_layout.tsx", [
    index("routes/home.tsx"),
    route("system", "routes/system.tsx"),
    route("settings", "routes/settings.tsx"),
    route("jobs", "routes/jobs.tsx"),
    route("jobs/:jobId", "routes/jobs.$jobId.tsx"),
  ]),
  route("api/health", "routes/api.health.ts"),
  route("api/system/status", "routes/api.system.status.ts"),
  route("api/system/restart", "routes/api.system.restart.ts"),
  route("api/models/catalog", "routes/api.models.catalog.ts"),
  route("api/models/refresh", "routes/api.models.refresh.ts"),
  route("api/models/defaults", "routes/api.models.defaults.ts"),
  route("api/settings/notification-profile", "routes/api.settings.notification-profile.ts"),
  route("api/jobs", "routes/api.jobs.ts"),
  route("api/jobs/:jobId", "routes/api.jobs.$jobId.ts"),
  route("api/jobs/:jobId/run-now", "routes/api.jobs.$jobId.run-now.ts"),
  route("api/jobs/:jobId/audit", "routes/api.jobs.$jobId.audit.ts"),
  route("api/jobs/:jobId/runs", "routes/api.jobs.$jobId.runs.ts"),
  route("api/jobs/:jobId/runs/:runId", "routes/api.jobs.$jobId.runs.$runId.ts"),
] satisfies RouteConfig
