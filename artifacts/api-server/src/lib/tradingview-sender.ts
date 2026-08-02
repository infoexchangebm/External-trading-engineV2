import { logger } from "./logger";

export interface TvSignalPayload {
  symbol: string;
  finalSignal: string;
  confidence: number;
  macroSignal?: string;
  orderbookSignal?: string;
  earningsSignal?: string;
  technicalSignal?: string;
}

export async function sendToTradingView(
  webhookUrl: string,
  payload: TvSignalPayload,
): Promise<{ success: boolean; error?: string }> {
  if (!webhookUrl) {
    logger.warn("TradingView webhook URL not configured");
    return { success: false, error: "Webhook URL not configured" };
  }

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, timestamp: new Date().toISOString() }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const msg = `HTTP ${res.status}`;
      logger.error({ symbol: payload.symbol, status: res.status }, "TradingView send failed");
      return { success: false, error: msg };
    }

    logger.info({ symbol: payload.symbol, finalSignal: payload.finalSignal }, "Signal sent to TradingView");
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err, symbol: payload.symbol }, "TradingView send error");
    return { success: false, error: msg };
  }
}
