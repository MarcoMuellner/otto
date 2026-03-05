import { resolveDocsServiceConfig } from "./config.js";
import { startDocsServer } from "./server.js";

const config = resolveDocsServiceConfig(process.env);
const server = startDocsServer(config);

let isShuttingDown = false;

const handleShutdownSignal = (signal: NodeJS.Signals): void => {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  process.stdout.write(
    `${JSON.stringify({ level: "info", component: "docs-service", message: "Shutdown signal received", signal })}\n`,
  );
  void server.close().catch((error: unknown) => {
    const err =
      error instanceof Error ? error : new Error("unknown_shutdown_error");
    process.stderr.write(
      `${JSON.stringify({ level: "error", component: "docs-service", message: "Shutdown failed", error: err.message })}\n`,
    );
  });
};

process.on("SIGINT", () => handleShutdownSignal("SIGINT"));
process.on("SIGTERM", () => handleShutdownSignal("SIGTERM"));
