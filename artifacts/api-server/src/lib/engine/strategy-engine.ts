import crypto from "crypto";
import { logger } from "../logger.js";
import { SignalInputs, EngineWeights, GeneratedSignal } from "./types.js";
import { detectAssetClass, getTradingViewTicker, getAssetWeightProfile, detectMarketSession } from "./asset-classifier.js";

/**
 * Generate a deterministic 16-character signal ID that deduplicates identical
 * symbol signals within a 3-minute time window.
 */
export function makeSignalId(symbol: string, timestampMs = Date.now()): string {
  const window3Min = Math.floor(timestampMs / 180000);
  return crypto
    .createHash("sha256")
    .update(`${symbol.toUpperCase()}-${window3Min}`)
    .digest("hex")
    .slice(0, 16);
}

function formatPriceByAssetClass(price: number, decimals: number): number {
  return parseFloat(price.toFixed(decimals));
}

export function generateSignal(
  symbol: string,
  inputs: SignalInputs,
  customWeights: Partial<EngineWeights> = {},
): GeneratedSignal {
  const assetClass = detectAssetClass(symbol);
  const tvTicker = getTradingViewTicker(symbol);
  const session = inputs.technical?.session ?? detectMarketSession();
  const defaultProfile = getAssetWeightProfile(assetClass);

  const w: EngineWeights = { ...defaultProfile, ...customWeights };
  const signalId = makeSignalId(symbol);

  // Decimal precision based on instrument class (e.g. 5 decimals for Forex pips)
  const priceDecimals = assetClass === "FOREX" ? 5 : assetClass === "COMMODITY" && symbol.includes("XAU") ? 2 : 2;

  let technicalScore = 0;
  let technicalConfidence = 0.5;
  let technicalSignal: "BULLISH" | "BEARISH" | "NEUTRAL" = "NEUTRAL";
  let rsiVal: number | undefined;
  let macdHistVal: number | undefined;
  let emaTrendVal: string | undefined;
  let atrVal: number | undefined;
  let currentPrice = 0;

  if (inputs.technical) {
    technicalScore = inputs.technical.normalizedScore;
    technicalConfidence = inputs.technical.dataConfidence;
    technicalSignal = inputs.technical.signal;
    currentPrice = inputs.technical.currentPrice;
    rsiVal = inputs.technical.rsi;
    macdHistVal = inputs.technical.macd.histogram;
    emaTrendVal = inputs.technical.emaTrend;
    atrVal = inputs.technical.atr;
  }

  let obScore = 0;
  let obConfidence = 0;
  let obSignal: "BULLISH" | "BEARISH" | "NEUTRAL" = "NEUTRAL";
  let imbalanceVal: number | undefined;

  if (inputs.liquidity && inputs.liquidity.hasData) {
    obScore = inputs.liquidity.normalizedScore;
    obConfidence = inputs.liquidity.dataConfidence;
    obSignal = inputs.liquidity.signal;
    imbalanceVal = inputs.liquidity.imbalance;
  }

  let macroScore = 0;
  let macroConfidence = 0.5;
  let macroSignal: "BULLISH" | "BEARISH" | "NEUTRAL" = "NEUTRAL";
  let vixVal: number | null = null;

  if (inputs.macro) {
    macroScore = inputs.macro.riskOnScore;
    macroConfidence = inputs.macro.dataConfidence;
    macroSignal = inputs.macro.signal;
    vixVal = inputs.macro.vix;
  }

  let earningsScore = 0;
  let earningsConfidence = 0;
  let earningsSignal: "BULLISH" | "BEARISH" | "NEUTRAL" = "NEUTRAL";

  if (inputs.earnings && inputs.earnings.signal) {
    earningsSignal = inputs.earnings.signal;
    earningsScore = earningsSignal === "BULLISH" ? 1.0 : earningsSignal === "BEARISH" ? -1.0 : 0;
    earningsConfidence = 1.0;
  }

  // Dynamic weight reallocation based on data availability & asset profile
  let activeMacroWeight = inputs.macro ? w.macro : 0;
  let activeObWeight = inputs.liquidity && inputs.liquidity.hasData ? w.orderbook : 0;
  let activeEarningsWeight = inputs.earnings ? w.earnings : 0;
  let activeTechnicalWeight = inputs.technical ? w.technical : 0;

  const totalActiveWeight = activeMacroWeight + activeObWeight + activeEarningsWeight + activeTechnicalWeight;

  if (totalActiveWeight > 0) {
    activeMacroWeight /= totalActiveWeight;
    activeObWeight /= totalActiveWeight;
    activeEarningsWeight /= totalActiveWeight;
    activeTechnicalWeight /= totalActiveWeight;
  } else {
    activeTechnicalWeight = 1.0;
  }

  // Compute composite normalized score [-1.0 .. +1.0]
  const compositeScore =
    macroScore * activeMacroWeight +
    obScore * activeObWeight +
    earningsScore * activeEarningsWeight +
    technicalScore * activeTechnicalWeight;

  const normalizedScore = parseFloat(Math.max(-1.0, Math.min(+1.0, compositeScore)).toFixed(4));

  // Final signal side
  let finalSignal: "BUY" | "SELL" | "NONE" = "NONE";
  if (normalizedScore >= w.threshold) {
    finalSignal = "BUY";
  } else if (normalizedScore <= -w.threshold) {
    finalSignal = "SELL";
  }

  // Confidence calculation normalized [0.0 .. 1.0]
  const signalStrength = Math.abs(normalizedScore);
  const overallDataConfidence = parseFloat(
    (
      technicalConfidence * activeTechnicalWeight +
      obConfidence * activeObWeight +
      macroConfidence * activeMacroWeight +
      earningsConfidence * activeEarningsWeight
    ).toFixed(2),
  );

  const confidence = parseFloat(
    Math.max(0.0, Math.min(1.0, signalStrength * 0.7 + overallDataConfidence * 0.3)).toFixed(2),
  );

  // Stop-Loss and Take-Profit target calculations
  let stopLoss: number | null = null;
  let takeProfit: number | null = null;

  if (currentPrice > 0 && atrVal && atrVal > 0 && finalSignal !== "NONE") {
    const slDistance = atrVal * w.atrSlMultiplier;
    const tpDistance = atrVal * w.atrTpMultiplier;

    if (finalSignal === "BUY") {
      stopLoss = formatPriceByAssetClass(currentPrice - slDistance, priceDecimals);
      takeProfit = formatPriceByAssetClass(currentPrice + tpDistance, priceDecimals);
    } else if (finalSignal === "SELL") {
      stopLoss = formatPriceByAssetClass(currentPrice + slDistance, priceDecimals);
      takeProfit = formatPriceByAssetClass(currentPrice - tpDistance, priceDecimals);
    }
  }

  const result: GeneratedSignal = {
    id: signalId,
    symbol,
    tvTicker,
    assetClass,
    session,
    finalSignal,
    confidence,
    score: normalizedScore,
    currentPrice,
    stopLoss,
    takeProfit,
    dataConfidence: overallDataConfidence,
    macroSignal,
    orderbookSignal: obSignal,
    earningsSignal,
    technicalSignal,
    metrics: {
      rsi: rsiVal,
      macdHist: macdHistVal,
      emaTrend: emaTrendVal,
      atr: atrVal,
      imbalance: imbalanceVal,
      vix: vixVal,
    },
    createdAt: new Date().toISOString(),
  };

  logger.info({ id: signalId, symbol, assetClass, tvTicker, finalSignal, score: normalizedScore, confidence }, "Multi-asset signal generated");
  return result;
}
