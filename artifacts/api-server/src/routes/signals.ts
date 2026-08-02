import { Router, type IRouter } from "express";
import { db, signalsTable, engineConfigTable, webhookLogsTable } from "@workspace/db";
import { desc, eq, and, sql } from "drizzle-orm";
import {
  ListSignalsQueryParams,
  GenerateSignalBody,
  ListSignalsResponse,
  GenerateSignalResponse,
  GetSignalSummaryResponse,
} from "@workspace/api-zod";
import { generateSignal } from "../lib/engine/strategy-engine.js";
import { fetchTechnicalMetrics } from "../lib/engine/technical-fetcher.js";
import { fetchOrderbookForSymbol } from "../lib/engine/orderbook-fetcher.js";
import { fetchMacroData } from "../lib/engine/macro-fetcher.js";
import { sendToTradingView } from "../lib/engine/tradingview-sender.js";

const router: IRouter = Router();

router.get("/signals", async (req, res): Promise<void> => {
  const parsed = ListSignalsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { symbol, finalSignal, limit = 50 } = parsed.data;

  const conditions = [];
  if (symbol) conditions.push(eq(signalsTable.symbol, symbol));
  if (finalSignal) conditions.push(eq(signalsTable.finalSignal, finalSignal));

  const rows = await db
    .select()
    .from(signalsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(signalsTable.createdAt))
    .limit(limit ?? 50);

  res.json(ListSignalsResponse.parse(rows));
});

router.get("/signals/summary", async (req, res): Promise<void> => {
  const [totals] = await db
    .select({
      total: sql<number>`count(*)::int`,
      buyCount: sql<number>`count(*) filter (where ${signalsTable.finalSignal} = 'BUY')::int`,
      sellCount: sql<number>`count(*) filter (where ${signalsTable.finalSignal} = 'SELL')::int`,
      noneCount: sql<number>`count(*) filter (where ${signalsTable.finalSignal} = 'NONE')::int`,
      avgConfidence: sql<number>`coalesce(avg(${signalsTable.confidence}), 0)`,
    })
    .from(signalsTable);

  const recentSignals = await db
    .select()
    .from(signalsTable)
    .orderBy(desc(signalsTable.createdAt))
    .limit(5);

  const symbolRows = await db
    .select({
      symbol: signalsTable.symbol,
      count: sql<number>`count(*)::int`,
      lastSignal: sql<string>`(array_agg(${signalsTable.finalSignal} order by ${signalsTable.createdAt} desc))[1]`,
      lastConfidence: sql<number>`(array_agg(${signalsTable.confidence} order by ${signalsTable.createdAt} desc))[1]`,
    })
    .from(signalsTable)
    .groupBy(signalsTable.symbol);

  const summary = {
    totalSignals: totals?.total ?? 0,
    buyCount: totals?.buyCount ?? 0,
    sellCount: totals?.sellCount ?? 0,
    noneCount: totals?.noneCount ?? 0,
    avgConfidence: parseFloat((totals?.avgConfidence ?? 0).toFixed(3)),
    recentSignals,
    symbolBreakdown: symbolRows,
  };

  res.json(GetSignalSummaryResponse.parse(summary));
});

router.post("/signals/generate", async (req, res): Promise<void> => {
  const parsed = GenerateSignalBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { symbol, sendToTradingView: shouldSend = false } = parsed.data;

  // Get current config
  const [config] = await db.select().from(engineConfigTable).limit(1);

  const weights = config
    ? {
        macro: config.macroWeight,
        orderbook: config.orderbookWeight,
        earnings: config.earningsWeight,
        technical: config.technicalWeight,
        threshold: config.signalThreshold,
        atrSlMultiplier: config.atrSlMultiplier ?? 1.5,
        atrTpMultiplier: config.atrTpMultiplier ?? 3.0,
      }
    : {};

  // Fetch live market data concurrently
  const [technical, liquidity, macro] = await Promise.all([
    fetchTechnicalMetrics(symbol).catch(() => undefined),
    fetchOrderbookForSymbol(symbol).catch(() => undefined),
    fetchMacroData().catch(() => undefined),
  ]);

  const signal = generateSignal(
    symbol,
    {
      technical,
      liquidity,
      macro,
    },
    weights,
  );

  // Persist signal to database
  const [saved] = await db
    .insert(signalsTable)
    .values({
      signalId: signal.id,
      symbol: signal.symbol,
      finalSignal: signal.finalSignal,
      confidence: signal.confidence,
      score: signal.score,
      stopLoss: signal.stopLoss,
      takeProfit: signal.takeProfit,
      dataConfidence: signal.dataConfidence,
      rsi: signal.metrics.rsi,
      macdHist: signal.metrics.macdHist,
      emaTrend: signal.metrics.emaTrend,
      macroSignal: signal.macroSignal,
      orderbookSignal: signal.orderbookSignal,
      earningsSignal: signal.earningsSignal,
      technicalSignal: signal.technicalSignal,
      sentToTradingView: false,
    })
    .returning();

  // Optionally send to TradingView
  if ((shouldSend || config?.autoSendEnabled) && signal.finalSignal !== "NONE") {
    const webhookUrl = config?.tradingViewWebhookUrl ?? "";
    const result = await sendToTradingView(webhookUrl, signal);

    if (saved) {
      await db
        .update(signalsTable)
        .set({ sentToTradingView: result.success })
        .where(eq(signalsTable.id, saved.id));
      saved.sentToTradingView = result.success;
    }

    await db.insert(webhookLogsTable).values({
      direction: "outbound",
      payload: JSON.stringify(signal),
      status: result.success ? "success" : "error",
      errorMessage: result.error ?? null,
    });
  }

  res.json(GenerateSignalResponse.parse(saved));
});

export default router;
