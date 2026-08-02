import { IStrategy, StrategySignal, StrategyEvaluationContext } from "../strategy-interface.js";

export class OrderbookImbalanceStrategy implements IStrategy {
  public id = "strat_ob_01";
  public name = "Order Book Imbalance & Liquidity Pressure Strategy";
  public type = "orderbook" as const;
  public weight: number;
  public enabled = true;

  constructor(weight = 0.25) {
    this.weight = weight;
  }

  public async evaluate(context: StrategyEvaluationContext): Promise<StrategySignal> {
    const imbalance = context.orderbookImbalance ?? 0; // -1 (heavy ask pressure) to +1 (heavy bid pressure)
    let score = Math.max(-1.0, Math.min(1.0, imbalance * 1.2));
    let signal: "BUY" | "SELL" | "NONE" = "NONE";

    if (score >= 0.25) signal = "BUY";
    else if (score <= -0.25) signal = "SELL";

    score = parseFloat(score.toFixed(4));
    const confidence = parseFloat(Math.min(Math.abs(score) + 0.2, 0.85).toFixed(2));

    return {
      strategyId: this.id,
      strategyName: this.name,
      type: this.type,
      symbol: context.symbol,
      signal,
      score,
      confidence,
      weight: this.weight,
      timestamp: new Date().toISOString(),
      metadata: { orderbookImbalance: imbalance },
    };
  }
}
