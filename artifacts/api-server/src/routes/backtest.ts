import { Router } from "express";
import { backtestEngine } from "../lib/backtesting/backtest-engine.js";
import { socLogger } from "../lib/observability/soc-logger.js";

const router = Router();

// POST run strategy backtest
router.post("/run", async (req, res) => {
  const { symbol, startDate, endDate, initialBalance, spreadPips, slippagePips } = req.body;

  if (!symbol) {
    res.status(400).json({ error: "Missing required parameter: symbol" });
    return;
  }

  try {
    await socLogger.log("STRATEGY", "INFO", `Backtest initiated for ${symbol}`, { metadata: req.body });
    const result = await backtestEngine.runBacktest({
      symbol,
      startDate: startDate || "2026-01-01",
      endDate: endDate || "2026-07-30",
      initialBalance: Number(initialBalance || 100000),
      spreadPips: Number(spreadPips || 1.0),
      slippagePips: Number(slippagePips || 0.5),
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Backtest failed", message: String(err) });
  }
});

export default router;
