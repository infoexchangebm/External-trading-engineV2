import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { riskEngine } from "../lib/risk/risk-engine.js";
import { scannerLoop } from "../lib/engine/scanner-loop.js";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const isBreakerTripped = riskEngine.isCircuitBreakerOpen();
  const scannerHealth = scannerLoop.getHealth();

  const data = HealthCheckResponse.parse({
    status: isBreakerTripped ? "degraded" : "ok",
  });

  res.json({
    ...data,
    subsystems: {
      riskEngine: {
        circuitBreakerOpen: isBreakerTripped,
        limits: riskEngine.getLimits(),
      },
      scannerLoop: scannerHealth,
      brokerLayer: {
        activeBrokers: ["paper", "oanda", "binance", "deriv", "icmarkets_fix", "mt5"],
      },
    },
    timestamp: new Date().toISOString(),
  });
});

export default router;
