import { BrokerPosition, IBrokerAdapter } from "../brokers/broker-interface.js";
import { logger } from "../logger.js";

export interface PositionManagementConfig {
  enableTrailingStop: boolean;
  trailingStopPips: number;
  enableBreakEven: boolean;
  breakEvenTriggerPips: number;
  breakEvenOffsetPips: number;
  enablePartialTp: boolean;
  partialTpRatio: number; // e.g. 0.5 (close 50%)
  partialTpTriggerPips: number;
  maxHoldingHours: number;
  enableVolatilityExit: boolean;
  volatilityAtrExitMultiplier: number;
}

export class PositionManager {
  private config: PositionManagementConfig = {
    enableTrailingStop: true,
    trailingStopPips: 20,
    enableBreakEven: true,
    breakEvenTriggerPips: 30,
    breakEvenOffsetPips: 2,
    enablePartialTp: true,
    partialTpRatio: 0.5,
    partialTpTriggerPips: 40,
    maxHoldingHours: 48,
    enableVolatilityExit: true,
    volatilityAtrExitMultiplier: 3.0,
  };

  public updateConfig(cfg: Partial<PositionManagementConfig>): void {
    this.config = { ...this.config, ...cfg };
    logger.info({ config: this.config }, "PositionManager config updated");
  }

  public async processPositionCycle(
    position: BrokerPosition,
    currentPrice: number,
    currentAtr: number,
    baselineAtr: number,
    brokerAdapter: IBrokerAdapter,
    openedAtTimestamp: string,
  ): Promise<{
    modified: boolean;
    closed: boolean;
    reason?: string;
    actionTaken?: string;
  }> {
    position.currentPrice = currentPrice;
    const isLong = position.side === "LONG";
    const pipMultiplier = position.symbol.includes("JPY") ? 0.01 : 0.0001;

    // Gain calculation in pips
    const gainPips = isLong
      ? (currentPrice - position.entryPrice) / pipMultiplier
      : (position.entryPrice - currentPrice) / pipMultiplier;

    // 1. Time-based Exit check
    const openTimeMs = new Date(openedAtTimestamp).getTime();
    const hoursOpen = (Date.now() - openTimeMs) / (3600 * 1000);
    if (hoursOpen >= this.config.maxHoldingHours) {
      await brokerAdapter.closeOrder(position.positionId);
      logger.info({ positionId: position.positionId, hoursOpen }, "Time-based exit triggered");
      return { modified: false, closed: true, reason: `Max holding time reached (${hoursOpen.toFixed(1)}h)` };
    }

    // 2. Volatility-based Exit check
    if (this.config.enableVolatilityExit && baselineAtr > 0) {
      if (currentAtr / baselineAtr >= this.config.volatilityAtrExitMultiplier) {
        await brokerAdapter.closeOrder(position.positionId);
        logger.info({ positionId: position.positionId, currentAtr, baselineAtr }, "Volatility-based exit triggered");
        return { modified: false, closed: true, reason: `Extreme ATR volatility spike (${(currentAtr / baselineAtr).toFixed(1)}x)` };
      }
    }

    // 3. Partial Take Profit Logic
    if (
      this.config.enablePartialTp &&
      gainPips >= this.config.partialTpTriggerPips &&
      position.quantity > 0.01
    ) {
      const closeQty = parseFloat((position.quantity * this.config.partialTpRatio).toFixed(2));
      if (closeQty > 0) {
        await brokerAdapter.closeOrder(position.positionId, closeQty);
        logger.info({ positionId: position.positionId, closeQty, gainPips }, "Partial Take Profit executed");
        // Also move SL to Break-Even after partial TP
        const beSL = isLong
          ? position.entryPrice + this.config.breakEvenOffsetPips * pipMultiplier
          : position.entryPrice - this.config.breakEvenOffsetPips * pipMultiplier;
        await brokerAdapter.modifyOrder(position.positionId, { stopLoss: beSL });
        return {
          modified: true,
          closed: false,
          actionTaken: `Partial TP closed ${closeQty} units, SL moved to BE (${beSL})`,
        };
      }
    }

    // 4. Break-Even Logic
    if (this.config.enableBreakEven && gainPips >= this.config.breakEvenTriggerPips) {
      const targetBeSL = isLong
        ? position.entryPrice + this.config.breakEvenOffsetPips * pipMultiplier
        : position.entryPrice - this.config.breakEvenOffsetPips * pipMultiplier;

      const needsBeUpdate = isLong
        ? !position.stopLoss || position.stopLoss < targetBeSL
        : !position.stopLoss || position.stopLoss > targetBeSL;

      if (needsBeUpdate) {
        await brokerAdapter.modifyOrder(position.positionId, { stopLoss: targetBeSL });
        position.stopLoss = targetBeSL;
        logger.info({ positionId: position.positionId, targetBeSL }, "Break-Even SL updated");
        return { modified: true, closed: false, actionTaken: `Stop-Loss updated to Break-Even (${targetBeSL})` };
      }
    }

    // 5. Trailing Stop Logic
    if (this.config.enableTrailingStop) {
      const trailDist = this.config.trailingStopPips * pipMultiplier;
      const desiredSL = isLong ? currentPrice - trailDist : currentPrice + trailDist;

      const shouldTrail = isLong
        ? !position.stopLoss || desiredSL > position.stopLoss
        : !position.stopLoss || desiredSL < position.stopLoss;

      if (shouldTrail) {
        await brokerAdapter.modifyOrder(position.positionId, { stopLoss: desiredSL });
        position.stopLoss = desiredSL;
        logger.info({ positionId: position.positionId, desiredSL }, "Trailing stop updated");
        return { modified: true, closed: false, actionTaken: `Trailing Stop updated to ${desiredSL.toFixed(4)}` };
      }
    }

    return { modified: false, closed: false };
  }
}

export const positionManager = new PositionManager();
