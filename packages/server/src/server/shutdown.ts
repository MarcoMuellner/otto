export type ShutdownHandler = () => Promise<void> | void;

/**
 * Installs signal handlers to stop the server gracefully.
 */
export function installShutdownHandlers(onShutdown: ShutdownHandler) {
  let called = false;

  const handler = async () => {
    if (called) {
      return;
    }
    called = true;
    await onShutdown();
  };

  process.on("SIGINT", handler);
  process.on("SIGTERM", handler);

  return () => {
    process.removeListener("SIGINT", handler);
    process.removeListener("SIGTERM", handler);
  };
}
