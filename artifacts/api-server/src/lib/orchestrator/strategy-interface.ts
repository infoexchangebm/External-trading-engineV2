export type StrategyType = "tradingview" | "internal_technical" | "ml_signal" | "macro" | "orderbook";

export type SignalDirection = "BUY" | "SELL" | "NONE";

export interface StrategySignal {
  strategyId: string;
  strategyName: string;
  type: StrategyType;
  symbol: string;
  signal: SignalDirection;
  score: number; // -1.0 (strong sell) to +1.0 (strong buy)
  confidence: number; // 0.0 to 1.0
  weight: number; // weight used for scoring
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface StrategyEvaluationContext {
  symbol: string;
  price?: number;
  bid?: number;
  ask?: number;
  rsi?: number;
  macdHist?: number;
  emaTrend?: "BULLISH" | "BEARISH" | "NEUTRAL";
  atr?: number;
  vix?: number;
  fedSignal?: "DOVISH" | "HAWKISH" | "NEUTRAL";
  orderbookImbalance?: number; // -1.0 to +1.0
  tradingViewAlert?: { action: string; price?: number; message?: string };
  mlProbability?: number; // 0.0 to 1.0 model output
}

export interface IStrategy {
  id: string;
  name: string;
  type: StrategyType;
  weight: number;
  enabled: boolean;
  evaluate(context: StrategyEvaluationContext): Promise<StrategySignal>;
}
