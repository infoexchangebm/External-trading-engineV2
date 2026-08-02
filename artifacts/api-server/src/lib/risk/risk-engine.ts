import { RiskLimits, RiskCheckRequest, RiskCheckResult } from "./risk-types.js";
import { logger } from "../logger.js";

export class RealRiskEngine {
  private limits: RiskLimits = {
    maxDailyLossUsd: 1000,
    maxWeeklyLossUsd: 3000,
    maxPositionSizeUsd: 50000,
    maxAssetExposureUsd: 100000,
    maxFxExposureUsd: 200000,
    maxGoldExposureUsd: 100000,
    maxOilExposureUsd: 100000,
    maxTradesPerHour: 10,
    maxSpreadPips: 3.0,
    maxAtrMultiplier: 2.5,
    newsBlackoutMinutesBefore: 15,
    newsBlackoutMinutesAfter: 15,
  };

  private isCircuitBreakerTripped = false;
  private circuitBreakerReason: string | null = null;

  // In-memory runtime tracking metrics
  private dailyLossUsd = 0;
  private weeklyLossUsd = 0;
  private recentTradeTimestamps: number[] = [];
  private openExposuresUsd: Record<string, number> = {};
  private assetClassExposuresUsd: Record<string, number> = {
    FX: 0,
    COMMODITIES: 0,
    CRYPTO: 0,
    EQUITIES: 0,
  };

  public updateLimits(newLimits: Partial<RiskLimits>): void {
    this.limits = { ...this.limits, ...newLimits };
    logger.info({ limits: this.limits }, "Updated Real Risk Engine limits");
  }

  public getLimits(): RiskLimits {
    return { ...this.limits };
  }

  public isCircuitBreakerOpen(): boolean {
    return this.isCircuitBreakerTripped;
  }

  public tripCircuitBreaker(reason: string): void {
    this.isCircuitBreakerTripped = true;
    this.circuitBreakerReason = reason;
    logger.fatal({ reason }, "ALERT: Circuit Breaker Tripped! Trading auto-halted.");
  }

  public resetCircuitBreaker(): void {
    this.isCircuitBreakerTripped = false;
    this.circuitBreakerReason = null;
    logger.info("Circuit Breaker reset manually.");
  }

  public recordClosedTradePnL(pnlUsd: number): void {
    if (pnlUsd < 0) {
      const loss = Math.abs(pnlUsd);
      this.dailyLossUsd += loss;
      this.weeklyLossUsd += loss;

      if (this.dailyLossUsd >= this.limits.maxDailyLossUsd) {
        this.tripCircuitBreaker(
          `Max Daily Loss limit breached! Cumulative daily loss: $${this.dailyLossUsd} >= $${this.limits.maxDailyLossUsd}`,
        );
      }

      if (this.weeklyLossUsd >= this.limits.maxWeeklyLossUsd) {
        this.tripCircuitBreaker(
          `Max Weekly Loss limit breached! Cumulative weekly loss: $${this.weeklyLossUsd} >= $${this.limits.maxWeeklyLossUsd}`,
        );
      }
    }
  }

  public evaluateTradeRisk(req: RiskCheckRequest): RiskCheckResult {
    const notionalUsd = req.quantity * req.price;
    const now = Date.now();

    // 1. Circuit Breaker check
    if (this.isCircuitBreakerTripped) {
      return {
        passed: false,
        rejectionReason: `Circuit Breaker ACTIVE: ${this.circuitBreakerReason}`,
        circuitBreakerTripped: true,
        metrics: this.buildMetricsSnapshot(req.symbol, req.assetClass),
      };
    }

    // 2. Max Daily Loss check
    if (this.dailyLossUsd >= this.limits.maxDailyLossUsd) {
      this.tripCircuitBreaker(`Daily loss limit reached ($${this.dailyLossUsd})`);
      return {
        passed: false,
        rejectionReason: `Max daily loss limit breached ($${this.dailyLossUsd} >= $${this.limits.maxDailyLossUsd})`,
        circuitBreakerTripped: true,
        metrics: this.buildMetricsSnapshot(req.symbol, req.assetClass),
      };
    }

    // 3. Max Weekly Loss check
    if (this.weeklyLossUsd >= this.limits.maxWeeklyLossUsd) {
      this.tripCircuitBreaker(`Weekly loss limit reached ($${this.weeklyLossUsd})`);
      return {
        passed: false,
        rejectionReason: `Max weekly loss limit breached ($${this.weeklyLossUsd} >= $${this.limits.maxWeeklyLossUsd})`,
        circuitBreakerTripped: true,
        metrics: this.buildMetricsSnapshot(req.symbol, req.assetClass),
      };
    }

    // 4. Max Position Size check
    if (notionalUsd > this.limits.maxPositionSizeUsd) {
      return {
        passed: false,
        rejectionReason: `Position size $${notionalUsd.toFixed(2)} exceeds max allowable $${this.limits.maxPositionSizeUsd}`,
        circuitBreakerTripped: false,
        adjustedQuantity: parseFloat((this.limits.maxPositionSizeUsd / req.price).toFixed(4)),
        metrics: this.buildMetricsSnapshot(req.symbol, req.assetClass),
      };
    }

    // 5. Max Exposure Per Asset check
    const currentAssetExposure = this.openExposuresUsd[req.symbol] || 0;
    if (currentAssetExposure + notionalUsd > this.limits.maxAssetExposureUsd) {
      return {
        passed: false,
        rejectionReason: `Symbol ${req.symbol} exposure would exceed cap ($${(currentAssetExposure + notionalUsd).toFixed(2)} > $${this.limits.maxAssetExposureUsd})`,
        circuitBreakerTripped: false,
        metrics: this.buildMetricsSnapshot(req.symbol, req.assetClass),
      };
    }

    // 6. Max Exposure Per Asset Class check
    const currentClassExp = this.assetClassExposuresUsd[req.assetClass] || 0;
    let maxClassCap = this.limits.maxFxExposureUsd;
    if (req.symbol.includes("XAU") || req.symbol.includes("GOLD")) maxClassCap = this.limits.maxGoldExposureUsd;
    else if (req.symbol.includes("OIL") || req.symbol.includes("CL")) maxClassCap = this.limits.maxOilExposureUsd;

    if (currentClassExp + notionalUsd > maxClassCap) {
      return {
        passed: false,
        rejectionReason: `Asset class ${req.assetClass} exposure would exceed cap ($${(currentClassExp + notionalUsd).toFixed(2)} > $${maxClassCap})`,
        circuitBreakerTripped: false,
        metrics: this.buildMetricsSnapshot(req.symbol, req.assetClass),
      };
    }

    // 7. Max Trades Per Hour Rate Limiter
    const oneHourAgo = now - 3600 * 1000;
    this.recentTradeTimestamps = this.recentTradeTimestamps.filter((t) => t > oneHourAgo);
    if (this.recentTradeTimestamps.length >= this.limits.maxTradesPerHour) {
      return {
        passed: false,
        rejectionReason: `Trade frequency limit reached (${this.recentTradeTimestamps.length} trades in past 60m >= max ${this.limits.maxTradesPerHour})`,
        circuitBreakerTripped: false,
        metrics: this.buildMetricsSnapshot(req.symbol, req.assetClass),
      };
    }

    // 8. Spread Filter
    if (req.currentSpreadPips !== undefined && req.currentSpreadPips > this.limits.maxSpreadPips) {
      return {
        passed: false,
        rejectionReason: `Spread too high (${req.currentSpreadPips} pips > max allowed ${this.limits.maxSpreadPips} pips)`,
        circuitBreakerTripped: false,
        metrics: this.buildMetricsSnapshot(req.symbol, req.assetClass),
      };
    }

    // 9. Volatility Filter
    if (req.currentAtr !== undefined && req.baselineAtr !== undefined && req.baselineAtr > 0) {
      const atrRatio = req.currentAtr / req.baselineAtr;
      if (atrRatio > this.limits.maxAtrMultiplier) {
        return {
          passed: false,
          rejectionReason: `Volatility spike detected (ATR ratio ${atrRatio.toFixed(2)}x > max ${this.limits.maxAtrMultiplier}x)`,
          circuitBreakerTripped: false,
          metrics: this.buildMetricsSnapshot(req.symbol, req.assetClass),
        };
      }
    }

    // 10. News Filter
    if (req.upcomingNewsEvent && req.upcomingNewsEvent.impact === "HIGH") {
      const eventTime = new Date(req.upcomingNewsEvent.time).getTime();
      const diffMinutes = (eventTime - now) / (60 * 1000);
      if (
        diffMinutes >= -this.limits.newsBlackoutMinutesAfter &&
        diffMinutes <= this.limits.newsBlackoutMinutesBefore
      ) {
        return {
          passed: false,
          rejectionReason: `High impact news blackout window active for '${req.upcomingNewsEvent.title}'`,
          circuitBreakerTripped: false,
          metrics: this.buildMetricsSnapshot(req.symbol, req.assetClass),
        };
      }
    }

    // Passed all risk checks! Update temporary exposure metrics & record trade timestamp
    this.recentTradeTimestamps.push(now);

    return {
      passed: true,
      circuitBreakerTripped: false,
      metrics: this.buildMetricsSnapshot(req.symbol, req.assetClass),
    };
  }

  public updateOpenExposures(symbol: string, assetClass: string, deltaNotionalUsd: number): void {
    this.openExposuresUsd[symbol] = Math.max(0, (this.openExposuresUsd[symbol] || 0) + deltaNotionalUsd);
    this.assetClassExposuresUsd[assetClass] = Math.max(
      0,
      (this.assetClassExposuresUsd[assetClass] || 0) + deltaNotionalUsd,
    );
  }

  private buildMetricsSnapshot(symbol: string, assetClass: string) {
    return {
      dailyLossUsd: this.dailyLossUsd,
      weeklyLossUsd: this.weeklyLossUsd,
      currentAssetExposureUsd: this.openExposuresUsd[symbol] || 0,
      currentAssetClassExposureUsd: this.assetClassExposuresUsd[assetClass] || 0,
      tradesInLastHour: this.recentTradeTimestamps.length,
    };
  }
}

export const riskEngine = new RealRiskEngine();
