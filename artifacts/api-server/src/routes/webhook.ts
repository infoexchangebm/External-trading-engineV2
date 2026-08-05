import { Router, type IRouter } from "express";
import { db, webhookLogsTable, engineConfigTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import {
  ReceiveTradingViewAlertBody,
  SendSignalToTradingViewBody,
  ListWebhookLogsQueryParams,
  ListWebhookLogsResponse,
  ReceiveTradingViewAlertResponse,
  SendSignalToTradingViewResponse,
} from "@workspace/api-zod";
import { sendToTradingView } from "../lib/tradingview-sender";
import { riskEngine } from "../lib/risk/risk-engine.js";
import { inferAssetClass } from "../lib/risk/infer-asset-class.js";
import { BrokerFactory } from "../lib/brokers/broker-factory.js";
import { TradeStateMachine } from "../lib/statemachine/trade-state-machine.js";
import { socLogger } from "../lib/observability/soc-logger.js";

const router: IRouter = Router();

function normalizeAction(action: string): "BUY" | "SELL" | null {
  const normalized = action.trim().toUpperCase();
  if (normalized === "BUY" || normalized === "LONG") return "BUY";
  if (normalized === "SELL" || normalized === "SHORT") return "SELL";
  return null;
}

router.post("/webhook/tradingview", async (req, res): Promise<void> => {
  const parsed = ReceiveTradingViewAlertBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const alert = parsed.data;
  // Never persist or log the shared secret alongside the alert payload.
  const { apiKey: _apiKey, ...loggablePayload } = alert;

  const hasExecutionFields =
    typeof alert.quantity === "number" &&
    alert.quantity > 0 &&
    typeof alert.price === "number" &&
    alert.price > 0;

  if (!hasExecutionFields) {
    await db.insert(webhookLogsTable).values({
      direction: "inbound",
      payload: JSON.stringify(loggablePayload),
      status: "received",
      errorMessage: null,
    });

    res.json(
      ReceiveTradingViewAlertResponse.parse({
        status: "received",
        message: "Alert logged (not executed - quantity and price are required to place an order)",
      }),
    );
    return;
  }

  const action = normalizeAction(alert.action);
  if (!action) {
    await db.insert(webhookLogsTable).values({
      direction: "inbound",
      payload: JSON.stringify(loggablePayload),
      status: "error",
      errorMessage: `Unsupported action: ${alert.action}`,
    });
    res.status(400).json({ error: `Unsupported action: ${alert.action}` });
    return;
  }

  const tradeId = `TV-TR-${Date.now()}`;
  const sm = new TradeStateMachine(tradeId, "INIT");
  const symbol = alert.symbol;
  const quantity = alert.quantity as number;
  const price = alert.price as number;

  await socLogger.log("EXECUTION", "INFO", `TradingView alert received: ${action} ${quantity} ${symbol}`, {
    tradeId,
    symbol,
    metadata: loggablePayload,
  });

  const riskCheck = riskEngine.evaluateTradeRisk({
    symbol,
    action,
    quantity,
    price,
    assetClass: inferAssetClass(symbol),
  });

  if (!riskCheck.passed) {
    sm.transition("ERROR", `Risk Engine Rejection: ${riskCheck.rejectionReason}`);
    await socLogger.log("RISK", "WARN", `TradingView trade REJECTED by Risk Engine: ${riskCheck.rejectionReason}`, {
      tradeId,
      symbol,
    });
    await db.insert(webhookLogsTable).values({
      direction: "inbound",
      payload: JSON.stringify(loggablePayload),
      status: "rejected",
      errorMessage: riskCheck.rejectionReason ?? null,
    });
    res.status(422).json(
      ReceiveTradingViewAlertResponse.parse({
        status: "rejected",
        message: riskCheck.rejectionReason ?? "Rejected by risk engine",
        rejectionReason: riskCheck.rejectionReason ?? null,
      }),
    );
    return;
  }

  sm.transition("VALIDATED", "Passed Real Risk Engine checks");

  const broker = BrokerFactory.getAdapter("paper");
  const result = await broker.placeOrder({
    symbol,
    action,
    type: "MARKET",
    quantity,
    price,
    stopLoss: alert.stopLoss ?? undefined,
    takeProfit: alert.takeProfit ?? undefined,
  });

  await db.insert(webhookLogsTable).values({
    direction: "inbound",
    payload: JSON.stringify(loggablePayload),
    status: result.success ? "executed" : "error",
    errorMessage: result.errorMessage ?? null,
  });

  if (!result.success) {
    sm.transition("ERROR", result.errorMessage);
    res.status(500).json(
      ReceiveTradingViewAlertResponse.parse({
        status: "error",
        message: result.errorMessage ?? "Paper broker order failed",
      }),
    );
    return;
  }

  sm.transition("EXECUTED", `Order filled by broker ${result.broker} at ${result.executedPrice}`);
  sm.transition("MANAGED", "Position registered into Position Manager");
  await socLogger.log("EXECUTION", "INFO", `TradingView order filled by ${result.broker} at ${result.executedPrice}`, {
    tradeId,
    symbol,
  });

  res.json(
    ReceiveTradingViewAlertResponse.parse({
      status: "executed",
      message: `Order filled by ${result.broker}`,
      tradeId,
      brokerOrderId: result.orderId,
      executedPrice: result.executedPrice,
    }),
  );
});

router.post("/webhook/send", async (req, res): Promise<void> => {
  const parsed = SendSignalToTradingViewBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [config] = await db.select().from(engineConfigTable).limit(1);
  const webhookUrl = config?.tradingViewWebhookUrl ?? "";

  const result = await sendToTradingView(webhookUrl, {
    symbol: parsed.data.symbol,
    finalSignal: parsed.data.finalSignal,
    confidence: parsed.data.confidence ?? 0,
  });

  await db.insert(webhookLogsTable).values({
    direction: "outbound",
    payload: JSON.stringify(parsed.data),
    status: result.success ? "success" : "error",
    errorMessage: result.error ?? null,
  });

  res.json(
    SendSignalToTradingViewResponse.parse({
      status: result.success ? "success" : "error",
      message: result.error ?? null,
    }),
  );
});

router.get("/webhook/logs", async (req, res): Promise<void> => {
  const parsed = ListWebhookLogsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { limit = 50, direction } = parsed.data;
  const rows = await db
    .select()
    .from(webhookLogsTable)
    .where(direction ? eq(webhookLogsTable.direction, direction) : undefined)
    .orderBy(desc(webhookLogsTable.createdAt))
    .limit(limit ?? 50);

  res.json(ListWebhookLogsResponse.parse(rows));
});

export default router;
