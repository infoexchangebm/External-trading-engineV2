import { logger } from "../logger.js";
import { LiquidityMetrics } from "./types.js";

const CACHE_TTL_MS = 15 * 1000;
const obCache = new Map<string, { data: LiquidityMetrics; fetchedAt: number }>();

export async function fetchOrderbookForSymbol(symbol: string): Promise<LiquidityMetrics> {
  const cached = obCache.get(symbol);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  // Provider 1: Binance REST (Crypto)
  if (symbol.endsWith("USDT") || symbol.endsWith("BTC") || symbol.endsWith("ETH")) {
    try {
      const url = `https://api.binance.com/api/v3/depth?symbol=${symbol}&limit=50`;
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (res.ok) {
        const data = (await res.json()) as { bids: [string, string][]; asks: [string, string][] };
        const bidVol = data.bids.reduce((s, b) => s + parseFloat(b[1]), 0);
        const askVol = data.asks.reduce((s, a) => s + parseFloat(a[1]), 0);
        const bestBid = parseFloat(data.bids[0]?.[0] ?? "0");
        const bestAsk = parseFloat(data.asks[0]?.[0] ?? "0");
        const spread = bestAsk > 0 && bestBid > 0 ? parseFloat((bestAsk - bestBid).toFixed(4)) : 0;
        const total = bidVol + askVol;
        const imbalance = total > 0 ? parseFloat(((bidVol - askVol) / total).toFixed(4)) : 0;
        const signal: "BULLISH" | "BEARISH" | "NEUTRAL" =
          imbalance > 0.15 ? "BULLISH" : imbalance < -0.15 ? "BEARISH" : "NEUTRAL";

        const metrics: LiquidityMetrics = {
          spread,
          bidVolume: parseFloat(bidVol.toFixed(2)),
          askVolume: parseFloat(askVol.toFixed(2)),
          imbalance,
          signal,
          normalizedScore: imbalance, // Already -1.0 .. +1.0
          provider: "Binance",
          hasData: true,
          dataConfidence: 1.0,
        };
        obCache.set(symbol, { data: metrics, fetchedAt: Date.now() });
        return metrics;
      }
    } catch (err) {
      logger.warn({ symbol, err }, "Binance depth fetch failed, trying Coinbase fallback");
    }

    // Provider 2: Coinbase Advanced Public REST fallback for Crypto
    try {
      const cbProductId = symbol.replace("USDT", "-USD").replace("BTC", "-BTC").replace("ETH", "-ETH");
      const url = `https://api.exchange.coinbase.com/products/${cbProductId}/book?level=2`;
      const res = await fetch(url, {
        headers: { "User-Agent": "TradingEngine/1.0" },
        signal: AbortSignal.timeout(4000),
      });
      if (res.ok) {
        const data = (await res.json()) as { bids: [string, string, number][]; asks: [string, string, number][] };
        const bidVol = data.bids.slice(0, 50).reduce((s, b) => s + parseFloat(b[1]), 0);
        const askVol = data.asks.slice(0, 50).reduce((s, a) => s + parseFloat(a[1]), 0);
        const bestBid = parseFloat(data.bids[0]?.[0] ?? "0");
        const bestAsk = parseFloat(data.asks[0]?.[0] ?? "0");
        const spread = bestAsk > 0 && bestBid > 0 ? parseFloat((bestAsk - bestBid).toFixed(4)) : 0;
        const total = bidVol + askVol;
        const imbalance = total > 0 ? parseFloat(((bidVol - askVol) / total).toFixed(4)) : 0;
        const signal: "BULLISH" | "BEARISH" | "NEUTRAL" =
          imbalance > 0.15 ? "BULLISH" : imbalance < -0.15 ? "BEARISH" : "NEUTRAL";

        const metrics: LiquidityMetrics = {
          spread,
          bidVolume: parseFloat(bidVol.toFixed(2)),
          askVolume: parseFloat(askVol.toFixed(2)),
          imbalance,
          signal,
          normalizedScore: imbalance,
          provider: "Coinbase",
          hasData: true,
          dataConfidence: 0.9,
        };
        obCache.set(symbol, { data: metrics, fetchedAt: Date.now() });
        return metrics;
      }
    } catch (err) {
      logger.warn({ symbol, err }, "Coinbase depth fetch failed");
    }
  }

  // All orderbook providers failed or non-crypto asset without depth API
  const fallbackMetrics: LiquidityMetrics = {
    spread: 0,
    bidVolume: 0,
    askVolume: 0,
    imbalance: 0,
    signal: "NEUTRAL",
    normalizedScore: 0,
    provider: "None",
    hasData: false,
    dataConfidence: 0.0, // Zero data confidence so strategy engine ignores orderbook weight
  };

  return fallbackMetrics;
}

export async function fetchOrderbook(symbols: string[]): Promise<Record<string, LiquidityMetrics>> {
  const result: Record<string, LiquidityMetrics> = {};
  await Promise.all(
    symbols.map(async (symbol) => {
      result[symbol] = await fetchOrderbookForSymbol(symbol);
    }),
  );
  return result;
}
