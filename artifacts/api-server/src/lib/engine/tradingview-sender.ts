import { logger } from "../logger.js";
import { GeneratedSignal } from "./types.js";

export interface TvSignalWebhookPayload {
  version: string;
  id: string;
  ticker: string; // TradingView formatted ticker (e.g. USOIL, EURUSD, AAPL)
  symbol: string;
  assetClass: string;
  session?: string;
  action: "BUY" | "SELL" | "NONE";
  price: number;
  stopLoss: number | null;
  takeProfit: number | null;
  confidence: number;
  score: number;
  dataConfidence: number;
  timestamp: string;
  components: {
    technical: "BULLISH" | "BEARISH" | "NEUTRAL";
    orderbook: "BULLISH" | "BEARISH" | "NEUTRAL";
    macro: "BULLISH" | "BEARISH" | "NEUTRAL";
    earnings: "BULLISH" | "BEARISH" | "NEUTRAL";
  };
  metrics: GeneratedSignal["metrics"];
}

export async function sendToTradingView(
  webhookUrl: string,
  signal: GeneratedSignal,
): Promise<{ success: boolean; error?: string }> {
  if (!webhookUrl) {
    logger.warn("TradingView webhook URL not configured");
    return { success: false, error: "Webhook URL not configured" };
  }

  const payload: TvSignalWebhookPayload = {
    version: "1.0",
    id: signal.id,
    ticker: signal.tvTicker || signal.symbol,
    symbol: signal.symbol,
    assetClass: signal.assetClass,
    session: signal.session,
    action: signal.finalSignal,
    price: signal.currentPrice,
    stopLoss: signal.stopLoss,
    takeProfit: signal.takeProfit,
    confidence: signal.confidence,
    score: signal.score,
    dataConfidence: signal.dataConfidence,
    timestamp: signal.createdAt,
    components: {
      technical: signal.technicalSignal,
      orderbook: signal.orderbookSignal,
      macro: signal.macroSignal,
      earnings: signal.earningsSignal,
    },
    metrics: signal.metrics,
  };

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const msg = `HTTP ${res.status}`;
      logger.error({ id: signal.id, ticker: payload.ticker, status: res.status }, "TradingView send failed");
      return { success: false, error: msg };
    }

    logger.info({ id: signal.id, ticker: payload.ticker, action: signal.finalSignal }, "Signal sent to TradingView");
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err, id: signal.id, ticker: payload.ticker }, "TradingView send error");
    return { success: false, error: msg };
  }
}
