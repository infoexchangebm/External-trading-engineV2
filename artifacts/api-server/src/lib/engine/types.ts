export type AssetClass = "FOREX" | "EQUITY" | "COMMODITY" | "CRYPTO";

export type MarketSession = "LONDON" | "NEW_YORK" | "OVERLAP" | "ASIAN";

export interface Candle {
  timestamp: number; // epoch ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isClosed: boolean;
}

export interface TechnicalMetrics {
  currentPrice: number;
  rsi: number; // 0..100
  ema20: number;
  ema50: number;
  emaTrend: "BULLISH" | "BEARISH" | "NEUTRAL";
  macd: {
    macd: number;
    signal: number;
    histogram: number;
  };
  macdSignal: "BULLISH" | "BEARISH" | "NEUTRAL";
  atr: number;
  normalizedScore: number; // -1.0 .. +1.0
  signal: "BULLISH" | "BEARISH" | "NEUTRAL";
  session?: MarketSession;
  dataConfidence: number; // 0.0 .. 1.0
}

export interface LiquidityMetrics {
  spread: number;
  bidVolume: number;
  askVolume: number;
  imbalance: number; // -1.0 .. +1.0
  signal: "BULLISH" | "BEARISH" | "NEUTRAL";
  normalizedScore: number; // -1.0 .. +1.0
  provider: string;
  hasData: boolean; // false if all orderbook providers failed
  dataConfidence: number; // 0.0 .. 1.0
}

export interface MacroMetrics {
  fedSignal: "DOVISH" | "HAWKISH" | "NEUTRAL";
  inflationSignal: "HIGH" | "LOW" | "NEUTRAL";
  gdp: string | null;
  cpi: string | null;
  vix: number | null;
  riskOnScore: number; // -1.0 .. +1.0
  signal: "BULLISH" | "BEARISH" | "NEUTRAL";
  dataConfidence: number; // 0.0 .. 1.0
  updatedAt: string;
}

export interface SignalInputs {
  technical?: TechnicalMetrics;
  liquidity?: LiquidityMetrics;
  macro?: MacroMetrics;
  earnings?: { surprisePercent?: number; signal?: "BULLISH" | "BEARISH" | "NEUTRAL" };
}

export interface EngineWeights {
  macro: number;
  orderbook: number;
  earnings: number;
  technical: number;
  threshold: number;
  atrSlMultiplier: number;
  atrTpMultiplier: number;
}

export interface GeneratedSignal {
  id: string; // Deterministic 3-minute deduplication SHA-256 hash
  symbol: string;
  tvTicker: string; // TradingView formatted ticker (e.g., USOIL for CL=F)
  assetClass: AssetClass;
  session?: MarketSession;
  finalSignal: "BUY" | "SELL" | "NONE";
  confidence: number; // 0.0 .. 1.0
  score: number; // Normalized total score
  currentPrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
  dataConfidence: number; // Overall aggregated data confidence 0.0 .. 1.0
  macroSignal: "BULLISH" | "BEARISH" | "NEUTRAL";
  orderbookSignal: "BULLISH" | "BEARISH" | "NEUTRAL";
  earningsSignal: "BULLISH" | "BEARISH" | "NEUTRAL";
  technicalSignal: "BULLISH" | "BEARISH" | "NEUTRAL";
  metrics: {
    rsi?: number;
    macdHist?: number;
    emaTrend?: string;
    atr?: number;
    imbalance?: number;
    vix?: number | null;
  };
  createdAt: string;
}

export interface ScannerHealth {
  isRunning: boolean;
  intervalMs: number;
  lastSuccessfulRun: string | null;
  lastError: string | null;
  totalScans: number;
  failedScans: number;
  circuitBreakers: Record<string, { isOpen: boolean; failedAttempts: number; retryAt: string | null }>;
}
