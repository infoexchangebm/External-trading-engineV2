import { Router } from "express";
import { BrokerFactory } from "../lib/brokers/broker-factory.js";

const router = Router();

// Positions/balance for the internal paper simulation broker - lets you see
// what orders placed via the TradingView webhook actually did.
router.get("/positions", async (req, res) => {
  const broker = BrokerFactory.getAdapter("paper");
  const positions = await broker.getPositions(req.query.symbol as string);
  res.json({ positions });
});

router.get("/balance", async (_req, res) => {
  const broker = BrokerFactory.getAdapter("paper");
  const balance = await broker.getBalance();
  res.json(balance);
});

export default router;
