import { logger } from "../logger.js";
import { Candle, TechnicalMetrics } from "./types.js";
import { detectAssetClass, detectMarketSession } from "./asset-classifier.js";

const CACHE_TTL_MS = 60 * 1000;
const candleCache = new Map<string, { data: Candle[]; fetchedAt: number }>();

function normalizeSymbolForYahoo(symbol: string): string {
  const clean = symbol.toUpperCase().trim();
  const assetClass = detectAssetClass(clean);

  if (assetClass === "FOREX") {
    if (clean.endsWith("=X")) return clean;
    return `${clean}=X`;
  }

  if (assetClass === "COMMODITY") {
    if (clean === "XAUUSD" || clean === "GOLD") return "GC=F";
    if (clean === "XAGUSD" || clean === "SILVER") return "SI=F";
    if (clean === "USOIL" || clean === "OIL") return "CL=F";
    if (clean === "UKOIL" || clean === "BRENT") return "BZ=F";
    return clean;
  }

  if (assetClass === "CRYPTO") {
    if (clean.endsWith("USDT")) return clean.replace("USDT", "-USD");
    if (clean.endsWith("USD")) return clean.replace("USD", "-USD");
    return clean;
  }

  return clean; // Equities: AAPL, MSFT, SPY, QQQ
}

export async function fetchCandles(symbol: string): Promise<Candle[]> {
  const cached = candleCache.get(symbol);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  const assetClass = detectAssetClass(symbol);

  // Provider 1: Binance REST (Crypto only)
  if (assetClass === "CRYPTO") {
    try {
      const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1h&limit=100`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const raw = (await res.json()) as any[];
        const now = Date.now();
        const candles: Candle[] = raw.map((item) => {
          const closeTime = Number(item[6]);
          return {
            timestamp: Number(item[0]),
            open: parseFloat(item[1]),
            high: parseFloat(item[2]),
            low: parseFloat(item[3]),
            close: parseFloat(item[4]),
            volume: parseFloat(item[5]),
            isClosed: closeTime < now,
          };
        });
        if (candles.length > 0) {
          candleCache.set(symbol, { data: candles, fetchedAt: Date.now() });
          return candles;
        }
      }
    } catch (err) {
      logger.warn({ symbol, err }, "Binance candle fetch failed, falling back to Yahoo");
    }
  }

  // Provider 2: Yahoo Finance REST (Supports Forex, Commodities, Equities, Crypto)
  try {
    const yahooSymbol = normalizeSymbolForYahoo(symbol);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?range=5d&interval=1h`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
      signal: AbortSignal.timeout(6000),
    });
    if (res.ok) {
      const json = (await res.json()) as any;
      const result = json?.chart?.result?.[0];
      if (result) {
        const timestamps: number[] = result.timestamp || [];
        const quote = result.indicators?.quote?.[0] || {};
        const opens: number[] = quote.open || [];
        const highs: number[] = quote.high || [];
        const lows: number[] = quote.low || [];
        const closes: number[] = quote.close || [];
        const volumes: number[] = quote.volume || [];

        const nowSec = Math.floor(Date.now() / 1000);
        const candles: Candle[] = [];
        for (let i = 0; i < timestamps.length; i++) {
          if (closes[i] !== null && closes[i] !== undefined) {
            candles.push({
              timestamp: timestamps[i] * 1000,
              open: opens[i] ?? closes[i],
              high: highs[i] ?? closes[i],
              low: lows[i] ?? closes[i],
              close: closes[i],
              volume: volumes[i] ?? 0,
              isClosed: timestamps[i] + 3600 <= nowSec,
            });
          }
        }
        if (candles.length > 0) {
          candleCache.set(symbol, { data: candles, fetchedAt: Date.now() });
          return candles;
        }
      }
    }
  } catch (err) {
    logger.warn({ symbol, err }, "Yahoo candle fetch failed");
  }

  return [];
}

// Indicator computations
function calculateEMA(prices: number[], period: number): number[] {
  if (prices.length < period) return [];
  const k = 2 / (period + 1);
  const ema: number[] = [];
  let sma = 0;
  for (let i = 0; i < period; i++) sma += prices[i];
  sma /= period;
  ema.push(sma);

  for (let i = period; i < prices.length; i++) {
    const nextEma = prices[i] * k + ema[ema.length - 1] * (1 - k);
    ema.push(nextEma);
  }
  return ema;
}

function calculateRSI(prices: number[], period = 14): number {
  if (prices.length <= period) return 50;
  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff >= 0) {
      avgGain = (avgGain * (period - 1) + diff) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) - diff) / period;
    }
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return parseFloat((100 - 100 / (1 + rs)).toFixed(2));
}

function calculateMACD(prices: number[]): { macd: number; signal: number; histogram: number } {
  if (prices.length < 26) return { macd: 0, signal: 0, histogram: 0 };
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);

  const offset = ema12.length - ema26.length;
  const macdLine: number[] = [];
  for (let i = 0; i < ema26.length; i++) {
    macdLine.push(ema12[i + offset] - ema26[i]);
  }

  const signalLineArr = calculateEMA(macdLine, 9);
  const latestMacd = macdLine[macdLine.length - 1] ?? 0;
  const latestSignal = signalLineArr[signalLineArr.length - 1] ?? 0;
  const histogram = latestMacd - latestSignal;

  return {
    macd: parseFloat(latestMacd.toFixed(4)),
    signal: parseFloat(latestSignal.toFixed(4)),
    histogram: parseFloat(histogram.toFixed(4)),
  };
}

function calculateATR(candles: Candle[], period = 14): number {
  if (candles.length < period + 1) return 0;
  const trs: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trs.push(tr);
  }

  let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
  }
  return parseFloat(atr.toFixed(4));
}

export async function fetchTechnicalMetrics(symbol: string): Promise<TechnicalMetrics> {
  const rawCandles = await fetchCandles(symbol);
  const closedCandles = rawCandles.filter((c) => c.isClosed);
  const candlesToUse = closedCandles.length >= 20 ? closedCandles : rawCandles;
  const session = detectMarketSession();

  if (candlesToUse.length === 0) {
    return {
      currentPrice: 0,
      rsi: 50,
      ema20: 0,
      ema50: 0,
      emaTrend: "NEUTRAL",
      macd: { macd: 0, signal: 0, histogram: 0 },
      macdSignal: "NEUTRAL",
      atr: 0,
      normalizedScore: 0,
      signal: "NEUTRAL",
      session,
      dataConfidence: 0,
    };
  }

  const closes = candlesToUse.map((c) => c.close);
  const currentPrice = closes[closes.length - 1];

  const rsi = calculateRSI(closes, 14);
  const ema20Arr = calculateEMA(closes, 20);
  const ema50Arr = calculateEMA(closes, 50);
  const macd = calculateMACD(closes);
  const atr = calculateATR(candlesToUse, 14);

  const ema20 = ema20Arr[ema20Arr.length - 1] ?? currentPrice;
  const ema50 = ema50Arr[ema50Arr.length - 1] ?? currentPrice;

  // Trend analysis
  const emaTrend: "BULLISH" | "BEARISH" | "NEUTRAL" =
    ema20 > ema50 * 1.001 ? "BULLISH" : ema20 < ema50 * 0.999 ? "BEARISH" : "NEUTRAL";

  const macdSignal: "BULLISH" | "BEARISH" | "NEUTRAL" =
    macd.histogram > 0 ? "BULLISH" : macd.histogram < 0 ? "BEARISH" : "NEUTRAL";

  // Score normalization [-1.0 .. +1.0]
  let rsiScore = 0;
  if (rsi < 30) rsiScore = +1.0;
  else if (rsi > 70) rsiScore = -1.0;
  else rsiScore = (50 - rsi) / 20;

  const emaScore = emaTrend === "BULLISH" ? +1.0 : emaTrend === "BEARISH" ? -1.0 : 0;
  const macdScore = macdSignal === "BULLISH" ? +1.0 : macdSignal === "BEARISH" ? -1.0 : 0;

  const rawScore = rsiScore * 0.35 + emaScore * 0.35 + macdScore * 0.30;
  const normalizedScore = parseFloat(Math.max(-1.0, Math.min(+1.0, rawScore)).toFixed(4));

  const signal: "BULLISH" | "BEARISH" | "NEUTRAL" =
    normalizedScore > 0.25 ? "BULLISH" : normalizedScore < -0.25 ? "BEARISH" : "NEUTRAL";

  const dataConfidence = parseFloat(Math.min(1.0, candlesToUse.length / 80).toFixed(2));

  return {
    currentPrice,
    rsi,
    ema20: parseFloat(ema20.toFixed(4)),
    ema50: parseFloat(ema50.toFixed(4)),
    emaTrend,
    macd,
    macdSignal,
    atr: atr || parseFloat((currentPrice * 0.01).toFixed(4)),
    normalizedScore,
    signal,
    session,
    dataConfidence,
  };
}
