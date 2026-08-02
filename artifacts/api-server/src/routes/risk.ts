import { Router } from "express";
import { riskEngine } from "../lib/risk/risk-engine.js";
import { socLogger } from "../lib/observability/soc-logger.js";

const router = Router();

// GET current risk rules
router.get("/rules", (_req, res) => {
  res.json({
    limits: riskEngine.getLimits(),
    circuitBreakerTripped: riskEngine.isCircuitBreakerOpen(),
  });
});

// PUT update risk rules
router.put("/rules", (req, res) => {
  riskEngine.updateLimits(req.body);
  socLogger.log("RISK", "INFO", "Updated Real Risk Engine limits via API", { metadata: req.body });
  res.json({ status: "UPDATED", limits: riskEngine.getLimits() });
});

// POST manually trip circuit breaker
router.post("/circuit-breaker/trip", (req, res) => {
  const reason = req.body.reason || "Manual trip via API";
  riskEngine.tripCircuitBreaker(reason);
  socLogger.log("RISK", "FATAL", `Circuit breaker tripped manually: ${reason}`);
  res.json({ status: "TRIPPED", circuitBreakerTripped: true, reason });
});

// POST reset circuit breaker
router.post("/circuit-breaker/reset", (_req, res) => {
  riskEngine.resetCircuitBreaker();
  socLogger.log("RISK", "INFO", "Circuit breaker reset manually via API");
  res.json({ status: "RESET", circuitBreakerTripped: false });
});

export default router;
