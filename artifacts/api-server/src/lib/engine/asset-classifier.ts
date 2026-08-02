import { AssetClass, EngineWeights, MarketSession } from "./types.js";

const FOREX_SYMBOLS = new Set([
  "EURUSD",
  "GBPUSD",
  "USDJPY",
  "AUDUSD",
  "USDCAD",
  "USDCHF",
  "NZDUSD",
  "EURGBP",
  "EURJPY",
  "GBPJPY",
]);

const COMMODITY_SYMBOLS = new Set([
  "XAUUSD",
  "XAGUSD",
  "CL=F",
  "BZ=F",
  "USO",
  "GC=F",
  "SI=F",
  "USOIL",
  "UKOIL",
  "GOLD",
  "SILVER",
]);

const CRYPTO_SYMBOLS = new Set([
  "BTCUSD",
  "BTCUSDT",
  "ETHUSD",
  "ETHUSDT",
  "SOLUSD",
  "SOLUSDT",
  "XRPUSD",
  "XRPUSDT",
]);

export function detectAssetClass(symbol: string): AssetClass {
  const clean = symbol.toUpperCase().replace(/[^A-Z0-9=]/g, "");

  if (FOREX_SYMBOLS.has(clean) || (clean.length === 6 && (clean.startsWith("EUR") || clean.startsWith("GBP") || clean.startsWith("USD") || clean.startsWith("AUD") || clean.startsWith("NZD") || clean.endsWith("USD") || clean.endsWith("JPY")) && !clean.startsWith("BTC") && !clean.startsWith("ETH"))) {
    if (clean === "XAUUSD" || clean === "XAGUSD") return "COMMODITY";
    return "FOREX";
  }

  if (COMMODITY_SYMBOLS.has(clean) || clean.includes("CL=") || clean.includes("GC=") || clean.includes("SI=")) {
    return "COMMODITY";
  }

  if (CRYPTO_SYMBOLS.has(clean) || clean.endsWith("USDT") || (clean.endsWith("USD") && (clean.startsWith("BTC") || clean.startsWith("ETH") || clean.startsWith("SOL")))) {
    return "CRYPTO";
  }

  return "EQUITY";
}

export function getTradingViewTicker(symbol: string): string {
  const clean = symbol.toUpperCase().trim();

  // Commodity conversions to TV standard tickers
  if (clean === "CL=F" || clean === "USO") return "USOIL";
  if (clean === "BZ=F" || clean === "BRN") return "UKOIL";
  if (clean === "GC=F") return "XAUUSD";
  if (clean === "SI=F") return "XAGUSD";

  // Forex cleanup (remove =X from Yahoo syntax)
  if (clean.endsWith("=X")) return clean.replace("=X", "");

  return clean;
}

export function getAssetWeightProfile(assetClass: AssetClass): EngineWeights {
  switch (assetClass) {
    case "FOREX":
      return {
        macro: 0.40,
        orderbook: 0.20,
        earnings: 0.00,
        technical: 0.40,
        threshold: 0.35,
        atrSlMultiplier: 1.5,
        atrTpMultiplier: 3.0,
      };
    case "COMMODITY":
      return {
        macro: 0.45,
        orderbook: 0.10,
        earnings: 0.00,
        technical: 0.45,
        threshold: 0.35,
        atrSlMultiplier: 1.5,
        atrTpMultiplier: 3.0,
      };
    case "EQUITY":
      return {
        macro: 0.25,
        orderbook: 0.15,
        earnings: 0.25,
        technical: 0.35,
        threshold: 0.40,
        atrSlMultiplier: 1.5,
        atrTpMultiplier: 3.0,
      };
    case "CRYPTO":
      return {
        macro: 0.30,
        orderbook: 0.35,
        earnings: 0.00,
        technical: 0.35,
        threshold: 0.40,
        atrSlMultiplier: 1.5,
        atrTpMultiplier: 3.0,
      };
  }
}

export function detectMarketSession(timestampMs = Date.now()): MarketSession {
  const date = new Date(timestampMs);
  const utcHour = date.getUTCHours();

  // London session: 08:00 - 16:00 UTC
  // New York session: 13:00 - 21:00 UTC
  // London/NY Overlap: 13:00 - 16:00 UTC
  // Asian session: 00:00 - 08:00 UTC
  if (utcHour >= 13 && utcHour < 16) {
    return "OVERLAP";
  }
  if (utcHour >= 8 && utcHour < 16) {
    return "LONDON";
  }
  if (utcHour >= 13 && utcHour < 21) {
    return "NEW_YORK";
  }
  return "ASIAN";
}
