import { Router } from "express";
import { riskEngine } from "../lib/risk/risk-engine.js";
import { BrokerFactory } from "../lib/brokers/broker-factory.js";
import { TradeStateMachine } from "../lib/statemachine/trade-state-machine.js";
import { socLogger } from "../lib/observability/soc-logger.js";
import { logger } from "../lib/logger.js";

const router = Router();

// Heartbeat check for MT5 WebRequest
router.get("/heartbeat", (_req, res) => {
  res.json({ status: "OK", serverTime: new Date().toISOString(), brokerBridge: "MT5 WebRequest Connector" });
});

// Receive trade request from MT5 EA
router.post("/trade", async (req, res) => {
  const { symbol, action, quantity, price, stopLoss, takeProfit, magicNumber } = req.body;

  if (!symbol || !action || !quantity) {
    res.status(400).json({ error: "Missing required parameters: symbol, action, quantity" });
    return;
  }

  const tradeId = `MT5-TR-${Date.now()}`;
  const sm = new TradeStateMachine(tradeId, "INIT");

  await socLogger.log("EXECUTION", "INFO", `MT5 EA Trade execution request received: ${action} ${quantity} ${symbol}`, {
    tradeId,
    symbol,
    metadata: req.body,
  });

  // Evaluate Risk Engine
  const riskCheck = riskEngine.evaluateTradeRisk({
    symbol,
    action: action.toUpperCase() as "BUY" | "SELL",
    quantity: Number(quantity),
    price: Number(price || 1.1050),
    assetClass: symbol.includes("XAU") ? "COMMODITIES" : symbol.includes("BTC") ? "CRYPTO" : "FX",
  });

  if (!riskCheck.passed) {
    sm.transition("ERROR", `Risk Engine Rejection: ${riskCheck.rejectionReason}`);
    await socLogger.log("RISK", "WARN", `MT5 Trade REJECTED by Risk Engine: ${riskCheck.rejectionReason}`, {
      tradeId,
      symbol,
    });
    res.status(422).json({
      status: "REJECTED",
      reason: riskCheck.rejectionReason,
      circuitBreakerTripped: riskCheck.circuitBreakerTripped,
    });
    return;
  }

  sm.transition("VALIDATED", "Passed Real Risk Engine checks");

  // Route to MT5 / Paper Broker Adapter
  const broker = BrokerFactory.getAdapter("mt5");
  const result = await broker.placeOrder({
    symbol,
    action: action.toUpperCase() as "BUY" | "SELL",
    type: "MARKET",
    quantity: Number(quantity),
    price: Number(price),
    stopLoss: Number(stopLoss),
    takeProfit: Number(takeProfit),
  });

  if (result.success) {
    sm.transition("EXECUTED", `Order filled by broker ${result.broker} at ${result.executedPrice}`);
    sm.transition("MANAGED", "Position registered into Position Manager");

    res.json({
      status: "SUCCESS",
      tradeId,
      brokerOrderId: result.orderId,
      executedPrice: result.executedPrice,
      executedQty: result.executedQty,
    });
  } else {
    sm.transition("ERROR", result.errorMessage);
    res.status(500).json({ status: "FAILED", error: result.errorMessage });
  }
});

// Fetch positions for MT5 synchronization
router.get("/positions", async (req, res) => {
  const broker = BrokerFactory.getAdapter("mt5");
  const positions = await broker.getPositions(req.query.symbol as string);
  res.json({ positions });
});

export default router;
