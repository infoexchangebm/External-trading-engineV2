import { logger } from "./logger";

export interface SignalInputs {
  macro?: { fedSignal: string; inflationSignal: string };
  orderbook?: Record<string, { imbalance: number; signal: string }>;
  earnings?: Record<string, unknown>;
}

export interface GeneratedSignal {
  symbol: string;
  finalSignal: "BUY" | "SELL" | "NONE";
  confidence: number;
  macroSignal: "BULLISH" | "BEARISH" | "NEUTRAL";
  orderbookSignal: "BULLISH" | "BEARISH" | "NEUTRAL";
  earningsSignal: "BULLISH" | "BEARISH" | "NEUTRAL";
  technicalSignal: "BULLISH" | "BEARISH" | "NEUTRAL";
  score: number;
}

export interface EngineWeights {
  macro: number;
  orderbook: number;
  earnings: number;
  technical: number;
  threshold: number;
}

const DEFAULT_WEIGHTS: EngineWeights = {
  macro: 0.25,
  orderbook: 0.30,
  earnings: 0.15,
  technical: 0.30,
  threshold: 0.4,
};

export function generateSignal(
  symbol: string,
  inputs: SignalInputs,
  weights: Partial<EngineWeights> = {},
): GeneratedSignal {
  const w = { ...DEFAULT_WEIGHTS, ...weights };

  const result: GeneratedSignal = {
    symbol,
    finalSignal: "NONE",
    confidence: 0,
    macroSignal: "NEUTRAL",
    orderbookSignal: "NEUTRAL",
    earningsSignal: "NEUTRAL",
    technicalSignal: "NEUTRAL",
    score: 0,
  };

  let score = 0;

  // Macro signal
  if (inputs.macro) {
    const fed = inputs.macro.fedSignal;
    if (fed === "DOVISH") {
      result.macroSignal = "BULLISH";
      score += w.macro;
    } else if (fed === "HAWKISH") {
      result.macroSignal = "BEARISH";
      score -= w.macro;
    }
  }

  // Orderbook imbalance signal
  if (inputs.orderbook && inputs.orderbook[symbol]) {
    const ob = inputs.orderbook[symbol];
    result.orderbookSignal = ob.signal as "BULLISH" | "BEARISH" | "NEUTRAL";
    if (ob.signal === "BULLISH") {
      score += w.orderbook;
    } else if (ob.signal === "BEARISH") {
      score -= w.orderbook;
    }
  }

  // Technical: simulate based on symbol characteristics (placeholder without live price data)
  const techBias = Math.sin(Date.now() / 1_000_000 + symbol.charCodeAt(0)) * 0.5;
  if (techBias > 0.15) {
    result.technicalSignal = "BULLISH";
    score += w.technical * techBias;
  } else if (techBias < -0.15) {
    result.technicalSignal = "BEARISH";
    score += w.technical * techBias;
  }

  result.score = parseFloat(score.toFixed(4));

  if (score >= w.threshold) {
    result.finalSignal = "BUY";
    result.confidence = parseFloat(Math.min(score, 1.0).toFixed(2));
  } else if (score <= -w.threshold) {
    result.finalSignal = "SELL";
    result.confidence = parseFloat(Math.min(Math.abs(score), 1.0).toFixed(2));
  }

  logger.info({ symbol, finalSignal: result.finalSignal, score }, "Signal generated");
  return result;
}
