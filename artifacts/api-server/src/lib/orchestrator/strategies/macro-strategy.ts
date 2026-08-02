import { IStrategy, StrategySignal, StrategyEvaluationContext } from "../strategy-interface.js";

export class MacroSignalStrategy implements IStrategy {
  public id = "strat_macro_01";
  public name = "Macroeconomic Stance & VIX Volatility Strategy";
  public type = "macro" as const;
  public weight: number;
  public enabled = true;

  constructor(weight = 0.20) {
    this.weight = weight;
  }

  public async evaluate(context: StrategyEvaluationContext): Promise<StrategySignal> {
    let score = 0;
    const fed = context.fedSignal;

    if (fed === "DOVISH") score += 0.6;
    else if (fed === "HAWKISH") score -= 0.6;

    // VIX dampener (VIX > 30 reduces confidence & pushes neutral score)
    if (context.vix !== undefined && context.vix > 30) {
      score *= 0.5;
    }

    let signal: "BUY" | "SELL" | "NONE" = "NONE";
    if (score >= 0.3) signal = "BUY";
    else if (score <= -0.3) signal = "SELL";

    score = parseFloat(score.toFixed(4));
    const confidence = parseFloat(Math.min(Math.abs(score) + 0.3, 0.9).toFixed(2));

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
      metadata: { fedSignal: fed, vix: context.vix },
    };
  }
}
