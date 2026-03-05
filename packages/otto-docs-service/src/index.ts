import { resolveDocsServiceConfig } from "./config.js";
import { startDocsServer } from "./server.js";

const config = resolveDocsServiceConfig(process.env);
const server = startDocsServer(config);

const handleShutdownSignal = (signal: NodeJS.Signals): void => {
  process.stdout.write(
    `${JSON.stringify({ level: "info", component: "docs-service", message: "Shutdown signal received", signal })}\n`,
  );
  server.close();
};

process.on("SIGINT", () => handleShutdownSignal("SIGINT"));
process.on("SIGTERM", () => handleShutdownSignal("SIGTERM"));
