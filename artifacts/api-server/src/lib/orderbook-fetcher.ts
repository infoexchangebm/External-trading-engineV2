import { logger } from "./logger";

export interface OrderbookResult {
  symbol: string;
  imbalance: number;
  signal: "BULLISH" | "BEARISH" | "NEUTRAL";
  bidVolume: number;
  askVolume: number;
  updatedAt: string;
}

export async function fetchOrderbook(symbols: string[]): Promise<OrderbookResult[]> {
  const results: OrderbookResult[] = [];

  for (const symbol of symbols) {
    try {
      const url = `https://api.binance.com/api/v3/depth?symbol=${symbol}&limit=50`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { bids: [string, string][]; asks: [string, string][] };

      const bidVol = data.bids.reduce((s, b) => s + parseFloat(b[1]), 0);
      const askVol = data.asks.reduce((s, a) => s + parseFloat(a[1]), 0);
      const total = bidVol + askVol;
      const imbalance = total > 0 ? parseFloat(((bidVol - askVol) / total).toFixed(4)) : 0;
      const signal: "BULLISH" | "BEARISH" | "NEUTRAL" =
        imbalance > 0.15 ? "BULLISH" : imbalance < -0.15 ? "BEARISH" : "NEUTRAL";

      results.push({ symbol, imbalance, signal, bidVolume: bidVol, askVolume: askVol, updatedAt: new Date().toISOString() });
    } catch (err) {
      logger.warn({ symbol, err }, "Orderbook fetch failed, using neutral fallback");
      results.push({
        symbol,
        imbalance: 0,
        signal: "NEUTRAL",
        bidVolume: 0,
        askVolume: 0,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  return results;
}
