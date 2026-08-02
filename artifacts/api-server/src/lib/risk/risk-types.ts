export interface RiskLimits {
  maxDailyLossUsd: number;
  maxWeeklyLossUsd: number;
  maxPositionSizeUsd: number;
  maxAssetExposureUsd: number;
  maxFxExposureUsd: number;
  maxGoldExposureUsd: number;
  maxOilExposureUsd: number;
  maxTradesPerHour: number;
  maxSpreadPips: number;
  maxAtrMultiplier: number;
  newsBlackoutMinutesBefore: number;
  newsBlackoutMinutesAfter: number;
}

export interface RiskCheckRequest {
  symbol: string;
  action: "BUY" | "SELL";
  quantity: number;
  price: number;
  assetClass: "FX" | "COMMODITIES" | "CRYPTO" | "EQUITIES";
  currentSpreadPips?: number;
  currentAtr?: number;
  baselineAtr?: number;
  upcomingNewsEvent?: { title: string; impact: "HIGH" | "MEDIUM" | "LOW"; time: string };
}

export interface RiskCheckResult {
  passed: boolean;
  rejectionReason?: string;
  circuitBreakerTripped: boolean;
  adjustedQuantity?: number;
  metrics: {
    dailyLossUsd: number;
    weeklyLossUsd: number;
    currentAssetExposureUsd: number;
    currentAssetClassExposureUsd: number;
    tradesInLastHour: number;
  };
}
