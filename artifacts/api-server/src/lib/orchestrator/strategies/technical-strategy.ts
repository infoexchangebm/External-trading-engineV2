import { IStrategy, StrategySignal, StrategyEvaluationContext } from "../strategy-interface.js";

export class InternalTechnicalStrategy implements IStrategy {
  public id = "strat_tech_01";
  public name = "Multi-Indicator Technical Strategy (RSI/MACD/EMA)";
  public type = "internal_technical" as const;
  public weight: number;
  public enabled = true;

  constructor(weight = 0.30) {
    this.weight = weight;
  }

  public async evaluate(context: StrategyEvaluationContext): Promise<StrategySignal> {
    let rawScore = 0;
    let factors = 0;

    // RSI analysis (oversold < 35 -> buy bias, overbought > 65 -> sell bias)
    if (context.rsi !== undefined) {
      factors++;
      if (context.rsi < 35) rawScore += 0.8;
      else if (context.rsi > 65) rawScore -= 0.8;
      else rawScore += (50 - context.rsi) / 50;
    }

    // MACD histogram momentum
    if (context.macdHist !== undefined) {
      factors++;
      if (context.macdHist > 0) rawScore += Math.min(context.macdHist * 2, 1.0);
      else rawScore += Math.max(context.macdHist * 2, -1.0);
    }

    // EMA trend alignment
    if (context.emaTrend) {
      factors++;
      if (context.emaTrend === "BULLISH") rawScore += 0.7;
      else if (context.emaTrend === "BEARISH") rawScore -= 0.7;
    }

    // Fallback simulation bias if no data supplied
    if (factors === 0) {
      const simBias = Math.sin(Date.now() / 500_000 + context.symbol.charCodeAt(0)) * 0.6;
      rawScore = simBias;
      factors = 1;
    }

    const avgScore = parseFloat(Math.max(-1.0, Math.min(1.0, rawScore / factors)).toFixed(4));
    let signal: "BUY" | "SELL" | "NONE" = "NONE";

    if (avgScore > 0.25) signal = "BUY";
    else if (avgScore < -0.25) signal = "SELL";

    const confidence = parseFloat(Math.min(Math.abs(avgScore) + 0.3, 0.95).toFixed(2));

    return {
      strategyId: this.id,
      strategyName: this.name,
      type: this.type,
      symbol: context.symbol,
      signal,
      score: avgScore,
      confidence,
      weight: this.weight,
      timestamp: new Date().toISOString(),
      metadata: { rsi: context.rsi, macdHist: context.macdHist, emaTrend: context.emaTrend },
    };
  }
}
