export interface SOCMetricsSnapshot {
  // True once at least one trade has been recorded via recordTradeClosed().
  // Every numeric field below is a real computation over recorded trades when
  // true; when false there is no trade history yet and the counts/ratios are
  // honest zeros/nulls rather than invented benchmark numbers. Nothing calls
  // recordTradeClosed() yet — that lands once paper-broker fills persist
  // (trades/positions tables), at which point this stops being permanently
  // hasData: false.
  hasData: boolean;
  winRate: number | null; // 0 to 100%, null until there's a closed trade
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  maxDrawdownPercent: number; // e.g. 3.5%
  currentExposureUsd: number;
  averageLatencyMs: number | null;
  volatilityIndex: number | null;
  profitFactor: number | null;
  sharpeRatio: number | null;
  updatedAt: string;
}

export class MetricsEngine {
  private tradesPnL: number[] = [];
  private totalExposure = 0;
  private latencySamplesMs: number[] = [];
  private currentVix: number | null = null;

  public recordTradeClosed(pnlUsd: number): void {
    this.tradesPnL.push(pnlUsd);
  }

  public recordLatency(latencyMs: number): void {
    this.latencySamplesMs.push(latencyMs);
    if (this.latencySamplesMs.length > 100) {
      this.latencySamplesMs.shift();
    }
  }

  public updateExposure(totalUsd: number): void {
    this.totalExposure = totalUsd;
  }

  public updateVix(vix: number): void {
    this.currentVix = vix;
  }

  public getSnapshot(): SOCMetricsSnapshot {
    const totalTrades = this.tradesPnL.length;
    const wins = this.tradesPnL.filter((p) => p > 0);
    const losses = this.tradesPnL.filter((p) => p < 0);
    const hasData = totalTrades > 0;

    const winRate = hasData ? parseFloat(((wins.length / totalTrades) * 100).toFixed(1)) : null;
    const grossProfit = wins.reduce((sum, p) => sum + p, 0);
    const grossLoss = Math.abs(losses.reduce((sum, p) => sum + p, 0));

    const profitFactor = grossLoss > 0 ? parseFloat((grossProfit / grossLoss).toFixed(2)) : null;

    // Max drawdown calculation
    let peak = 100000;
    let equity = 100000;
    let maxDd = 0;

    for (const pnl of this.tradesPnL) {
      equity += pnl;
      if (equity > peak) peak = equity;
      const dd = ((peak - equity) / peak) * 100;
      if (dd > maxDd) maxDd = dd;
    }

    // Average latency
    const avgLatency =
      this.latencySamplesMs.length > 0
        ? parseFloat((this.latencySamplesMs.reduce((a, b) => a + b, 0) / this.latencySamplesMs.length).toFixed(1))
        : null;

    // Sharpe ratio calculation — only meaningful with 2+ closed trades (needs a stddev)
    const returns = this.tradesPnL.map((p) => p / 100000);
    const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
    const stdDev =
      returns.length > 1
        ? Math.sqrt(returns.reduce((sq, n) => sq + Math.pow(n - avgReturn, 2), 0) / (returns.length - 1))
        : 0;

    const sharpeRatio = stdDev > 0 ? parseFloat(((avgReturn / stdDev) * Math.sqrt(252)).toFixed(2)) : null;

    return {
      hasData,
      winRate,
      totalTrades,
      winningTrades: wins.length,
      losingTrades: losses.length,
      maxDrawdownPercent: parseFloat(maxDd.toFixed(2)),
      currentExposureUsd: this.totalExposure,
      averageLatencyMs: avgLatency,
      volatilityIndex: this.currentVix,
      profitFactor,
      sharpeRatio,
      updatedAt: new Date().toISOString(),
    };
  }
}

export const metricsEngine = new MetricsEngine();
