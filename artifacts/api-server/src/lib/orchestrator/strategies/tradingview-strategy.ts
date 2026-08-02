import { IStrategy, StrategySignal, StrategyEvaluationContext } from "../strategy-interface.js";

export class TradingViewStrategy implements IStrategy {
  public id = "strat_tv_01";
  public name = "TradingView Signal Adapter Strategy";
  public type = "tradingview" as const;
  public weight: number;
  public enabled = true;

  constructor(weight = 0.25) {
    this.weight = weight;
  }

  public async evaluate(context: StrategyEvaluationContext): Promise<StrategySignal> {
    const alert = context.tradingViewAlert;
    let signal: "BUY" | "SELL" | "NONE" = "NONE";
    let score = 0;
    let confidence = 0;

    if (alert) {
      const act = alert.action.toUpperCase();
      if (act.includes("BUY") || act.includes("LONG")) {
        signal = "BUY";
        score = 0.8;
        confidence = 0.85;
      } else if (act.includes("SELL") || act.includes("SHORT")) {
        signal = "SELL";
        score = -0.8;
        confidence = 0.85;
      }
    }

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
      metadata: alert ? { alertAction: alert.action, price: alert.price } : {},
    };
  }
}
