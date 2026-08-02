import { IStrategy, StrategySignal, StrategyEvaluationContext } from "../strategy-interface.js";

export class MLSignalStrategy implements IStrategy {
  public id = "strat_ml_01";
  public name = "Machine Learning Pattern Classifier Strategy";
  public type = "ml_signal" as const;
  public weight: number;
  public enabled = true;

  constructor(weight = 0.20) {
    this.weight = weight;
  }

  public async evaluate(context: StrategyEvaluationContext): Promise<StrategySignal> {
    // If mlProbability provided (e.g. 0 to 1 where >0.6 is BUY, <0.4 is SELL)
    let prob = context.mlProbability;

    if (prob === undefined) {
      // Deterministic feature-based model inference simulation
      const rsiNorm = (context.rsi ?? 50) / 100;
      const macdNorm = Math.tanh(context.macdHist ?? 0);
      const obNorm = (context.orderbookImbalance ?? 0) / 2 + 0.5;

      prob = (rsiNorm * 0.3 + (macdNorm + 1) / 2 * 0.4 + obNorm * 0.3);
    }

    let signal: "BUY" | "SELL" | "NONE" = "NONE";
    let score = (prob - 0.5) * 2; // Map 0..1 to -1..+1

    if (prob >= 0.6) signal = "BUY";
    else if (prob <= 0.4) signal = "SELL";

    score = parseFloat(score.toFixed(4));
    const confidence = parseFloat(Math.min(Math.abs(score) * 0.8 + 0.2, 0.9).toFixed(2));

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
      metadata: { mlProbability: prob },
    };
  }
}
