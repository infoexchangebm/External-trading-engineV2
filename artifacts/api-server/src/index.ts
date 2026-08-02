import app from "./app.js";
import { logger } from "./lib/logger.js";
import { scannerLoop } from "./lib/engine/scanner-loop.js";

const rawPort = process.env["PORT"] || "8080";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Local Quantitative Signal Engine active");

  // Start background automated scanner loop
  scannerLoop.start();
});

// Graceful shutdown handling
function shutdown(signal: string) {
  logger.info({ signal }, "Shutting down Local Signal Engine gracefully");
  scannerLoop.stop();
  server.close(() => {
    logger.info("HTTP server closed");
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
