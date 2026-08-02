import { logger } from "../logger.js";

export type TradeState = "INIT" | "VALIDATED" | "EXECUTED" | "MANAGED" | "CLOSED" | "ERROR";

export interface StateTransitionEvent {
  from: TradeState;
  to: TradeState;
  timestamp: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export class TradeStateMachine {
  private static VALID_TRANSITIONS: Record<TradeState, TradeState[]> = {
    INIT: ["VALIDATED", "ERROR"],
    VALIDATED: ["EXECUTED", "ERROR"],
    EXECUTED: ["MANAGED", "CLOSED", "ERROR"],
    MANAGED: ["CLOSED", "ERROR"],
    CLOSED: [],
    ERROR: ["CLOSED"],
  };

  private currentState: TradeState = "INIT";
  private history: StateTransitionEvent[] = [];
  public readonly tradeId: string;

  constructor(tradeId: string, initialState: TradeState = "INIT") {
    this.tradeId = tradeId;
    this.currentState = initialState;
    this.history.push({
      from: "INIT",
      to: initialState,
      timestamp: new Date().toISOString(),
      reason: "Trade initialized",
    });
  }

  public getCurrentState(): TradeState {
    return this.currentState;
  }

  public getHistory(): StateTransitionEvent[] {
    return [...this.history];
  }

  public transition(toState: TradeState, reason?: string, metadata?: Record<string, unknown>): boolean {
    const allowed = TradeStateMachine.VALID_TRANSITIONS[this.currentState];

    if (!allowed || !allowed.includes(toState)) {
      logger.error(
        { tradeId: this.tradeId, current: this.currentState, attempted: toState },
        "Invalid state transition attempted!",
      );
      return false;
    }

    const event: StateTransitionEvent = {
      from: this.currentState,
      to: toState,
      timestamp: new Date().toISOString(),
      reason,
      metadata,
    };

    this.history.push(event);
    this.currentState = toState;

    logger.info(
      { tradeId: this.tradeId, transition: `${event.from} -> ${event.to}`, reason },
      "Trade state transitioned successfully",
    );

    return true;
  }
}
