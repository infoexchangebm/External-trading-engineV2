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

const router: IRouter = Router();

router.post("/webhook/tradingview", async (req, res): Promise<void> => {
  const parsed = ReceiveTradingViewAlertBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  await db.insert(webhookLogsTable).values({
    direction: "inbound",
    payload: JSON.stringify(parsed.data),
    status: "received",
    errorMessage: null,
  });

  res.json(ReceiveTradingViewAlertResponse.parse({ status: "received", message: "Alert logged" }));
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
