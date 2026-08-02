import {
  IStrategy,
  StrategyEvaluationContext,
  StrategySignal,
} from "./strategy-interface.js";
import {
  StrategyConflictResolver,
  OrchestratedAction,
  ResolutionMode,
} from "./conflict-resolver.js";
import { TradingViewStrategy } from "./strategies/tradingview-strategy.js";
import { InternalTechnicalStrategy } from "./strategies/technical-strategy.js";
import { MLSignalStrategy } from "./strategies/ml-strategy.js";
import { MacroSignalStrategy } from "./strategies/macro-strategy.js";
import { OrderbookImbalanceStrategy } from "./strategies/orderbook-strategy.js";
import { logger } from "../logger.js";

export class UnifiedStrategyOrchestrator {
  private strategies: Map<string, IStrategy> = new Map();

  constructor() {
    // Register default strategies dynamically
    this.registerStrategy(new TradingViewStrategy());
    this.registerStrategy(new InternalTechnicalStrategy());
    this.registerStrategy(new MLSignalStrategy());
    this.registerStrategy(new MacroSignalStrategy());
    this.registerStrategy(new OrderbookImbalanceStrategy());
  }

  public registerStrategy(strategy: IStrategy): void {
    this.strategies.set(strategy.id, strategy);
    logger.info({ id: strategy.id, name: strategy.name, type: strategy.type }, "Registered strategy in Orchestrator");
  }

  public removeStrategy(id: string): boolean {
    return this.strategies.delete(id);
  }

  public getStrategies(): IStrategy[] {
    return Array.from(this.strategies.values());
  }

  public async evaluateSymbol(
    symbol: string,
    context: StrategyEvaluationContext,
    options?: {
      threshold?: number;
      resolutionMode?: ResolutionMode;
      weightsOverride?: Record<string, number>;
    },
  ): Promise<OrchestratedAction> {
    const activeStrategies = Array.from(this.strategies.values()).filter((s) => s.enabled);

    // Apply temporary weight overrides if provided
    if (options?.weightsOverride) {
      for (const strat of activeStrategies) {
        if (options.weightsOverride[strat.type] !== undefined) {
          strat.weight = options.weightsOverride[strat.type];
        }
      }
    }

    // Run all registered strategies in parallel
    const evalPromises = activeStrategies.map(async (strat) => {
      try {
        return await strat.evaluate(context);
      } catch (err) {
        logger.error({ strategyId: strat.id, err }, "Strategy evaluation failed");
        return {
          strategyId: strat.id,
          strategyName: strat.name,
          type: strat.type,
          symbol,
          signal: "NONE" as const,
          score: 0,
          confidence: 0,
          weight: strat.weight,
          timestamp: new Date().toISOString(),
          metadata: { error: String(err) },
        } as StrategySignal;
      }
    });

    const signals = await Promise.all(evalPromises);

    // Resolve conflicts & determine final action
    const action = StrategyConflictResolver.resolve(
      symbol,
      signals,
      options?.threshold ?? 0.35,
      options?.resolutionMode ?? "WEIGHTED_CONSENSUS",
    );

    logger.info(
      {
        symbol,
        finalAction: action.finalAction,
        score: action.score,
        confidence: action.confidence,
        conflictDetected: action.conflictDetected,
      },
      "Orchestrator completed symbol evaluation",
    );

    return action;
  }
}

export const orchestrator = new UnifiedStrategyOrchestrator();
