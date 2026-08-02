import { StrategySignal, SignalDirection } from "./strategy-interface.js";

export type ResolutionMode = "WEIGHTED_CONSENSUS" | "UNANIMOUS" | "MAJORITY_VOTE" | "PRIORITY_OVERRIDE";

export interface OrchestratedAction {
  symbol: string;
  finalAction: SignalDirection;
  confidence: number;
  score: number;
  contributingSignals: StrategySignal[];
  conflictDetected: boolean;
  resolutionMode: ResolutionMode;
  explanation: string;
  stopLoss?: number;
  takeProfit?: number;
}

export class StrategyConflictResolver {
  public static resolve(
    symbol: string,
    signals: StrategySignal[],
    threshold = 0.35,
    mode: ResolutionMode = "WEIGHTED_CONSENSUS",
  ): OrchestratedAction {
    if (signals.length === 0) {
      return {
        symbol,
        finalAction: "NONE",
        confidence: 0,
        score: 0,
        contributingSignals: [],
        conflictDetected: false,
        resolutionMode: mode,
        explanation: "No active strategies evaluated",
      };
    }

    const buySignals = signals.filter((s) => s.signal === "BUY");
    const sellSignals = signals.filter((s) => s.signal === "SELL");

    // Conflict exists if there are both BUY and SELL signals from different strategies
    const conflictDetected = buySignals.length > 0 && sellSignals.length > 0;

    let finalAction: SignalDirection = "NONE";
    let aggregatedScore = 0;
    let totalWeight = 0;
    let confidence = 0;
    let explanation = "";

    switch (mode) {
      case "UNANIMOUS":
        if (buySignals.length > 0 && sellSignals.length === 0) {
          finalAction = "BUY";
          confidence = 0.9;
          explanation = "Unanimous BUY across all active strategies";
        } else if (sellSignals.length > 0 && buySignals.length === 0) {
          finalAction = "SELL";
          confidence = 0.9;
          explanation = "Unanimous SELL across all active strategies";
        } else {
          finalAction = "NONE";
          confidence = 0;
          explanation = conflictDetected
            ? "Conflict detected under UNANIMOUS mode — execution blocked"
            : "No active directional signals";
        }
        break;

      case "MAJORITY_VOTE":
        if (buySignals.length > sellSignals.length) {
          finalAction = "BUY";
          confidence = parseFloat((buySignals.length / signals.length).toFixed(2));
          explanation = `Majority BUY vote (${buySignals.length}/${signals.length})`;
        } else if (sellSignals.length > buySignals.length) {
          finalAction = "SELL";
          confidence = parseFloat((sellSignals.length / signals.length).toFixed(2));
          explanation = `Majority SELL vote (${sellSignals.length}/${signals.length})`;
        } else {
          finalAction = "NONE";
          explanation = "Tie vote across strategies";
        }
        break;

      case "PRIORITY_OVERRIDE":
        // Prioritize TradingView alert > Technical > ML > Macro > Orderbook
        const priorityOrder = ["tradingview", "internal_technical", "ml_signal", "macro", "orderbook"];
        const sorted = [...signals].sort(
          (a, b) => priorityOrder.indexOf(a.type) - priorityOrder.indexOf(b.type),
        );
        const top = sorted.find((s) => s.signal !== "NONE");
        if (top) {
          finalAction = top.signal;
          confidence = top.confidence;
          aggregatedScore = top.score;
          explanation = `Priority strategy (${top.strategyName}) determined direction: ${top.signal}`;
        }
        break;

      case "WEIGHTED_CONSENSUS":
      default:
        for (const sig of signals) {
          aggregatedScore += sig.score * sig.weight;
          totalWeight += sig.weight;
        }

        if (totalWeight > 0) {
          aggregatedScore = parseFloat((aggregatedScore / totalWeight).toFixed(4));
        }

        if (aggregatedScore >= threshold) {
          finalAction = "BUY";
          confidence = parseFloat(Math.min(aggregatedScore, 1.0).toFixed(2));
        } else if (aggregatedScore <= -threshold) {
          finalAction = "SELL";
          confidence = parseFloat(Math.min(Math.abs(aggregatedScore), 1.0).toFixed(2));
        }

        explanation = `Weighted consensus score: ${aggregatedScore} (Threshold: ${threshold}). ${
          conflictDetected ? "Conflict resolved via weighted average." : "Signals aligned."
        }`;
        break;
    }

    return {
      symbol,
      finalAction,
      confidence,
      score: aggregatedScore,
      contributingSignals: signals,
      conflictDetected,
      resolutionMode: mode,
      explanation,
    };
  }
}
