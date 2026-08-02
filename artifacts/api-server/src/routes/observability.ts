import { Router } from "express";
import { socLogger, SOCCategory } from "../lib/observability/soc-logger.js";
import { metricsEngine } from "../lib/observability/metrics-engine.js";

const router = Router();

// GET SOC logs
router.get("/soc-logs", (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : 50;
  const category = req.query.category as SOCCategory | undefined;
  const logs = socLogger.getRecentLogs(limit, category);
  res.json({ logs, count: logs.length });
});

// GET metrics snapshot
router.get("/metrics", (_req, res) => {
  const metrics = metricsEngine.getSnapshot();
  res.json(metrics);
});

export default router;
