import {
  IBrokerAdapter,
  OrderRequest,
  OrderResult,
  BrokerPosition,
  BrokerAccountBalance,
} from "./broker-interface.js";
import { logger } from "../logger.js";

export class PaperBrokerAdapter implements IBrokerAdapter {
  public id = "paper";
  public name = "Internal Paper Simulation Broker";

  private balance = 100000;
  private equity = 100000;
  private positions: Map<string, BrokerPosition> = new Map();
  private orderCounter = 1000;

  public async placeOrder(order: OrderRequest): Promise<OrderResult> {
    this.orderCounter++;
    const orderId = `PAPER-${this.orderCounter}`;
    const fillPrice = order.price || 1.1050; // default fallback execution price
    const notional = order.quantity * fillPrice;

    const side = order.action === "BUY" ? "LONG" : "SHORT";
    const existing = this.positions.get(order.symbol);

    if (existing) {
      if (existing.side === side) {
        // Add to existing position
        const totalQty = existing.quantity + order.quantity;
        const avgPrice = (existing.quantity * existing.entryPrice + notional) / totalQty;
        existing.quantity = totalQty;
        existing.entryPrice = avgPrice;
        existing.stopLoss = order.stopLoss ?? existing.stopLoss;
        existing.takeProfit = order.takeProfit ?? existing.takeProfit;
      } else {
        // Partial or full reversal
        if (order.quantity >= existing.quantity) {
          const remQty = order.quantity - existing.quantity;
          this.positions.delete(order.symbol);
          if (remQty > 0) {
            this.positions.set(order.symbol, {
              positionId: `POS-${order.symbol}`,
              symbol: order.symbol,
              side,
              quantity: remQty,
              entryPrice: fillPrice,
              currentPrice: fillPrice,
              stopLoss: order.stopLoss,
              takeProfit: order.takeProfit,
              unrealizedPnl: 0,
              broker: this.id,
            });
          }
        } else {
          existing.quantity -= order.quantity;
        }
      }
    } else {
      // New position
      this.positions.set(order.symbol, {
        positionId: `POS-${order.symbol}`,
        symbol: order.symbol,
        side,
        quantity: order.quantity,
        entryPrice: fillPrice,
        currentPrice: fillPrice,
        stopLoss: order.stopLoss,
        takeProfit: order.takeProfit,
        unrealizedPnl: 0,
        broker: this.id,
      });
    }

    logger.info({ orderId, symbol: order.symbol, action: order.action, fillPrice }, "Paper Broker filled order");

    return {
      success: true,
      orderId,
      symbol: order.symbol,
      action: order.action,
      executedQty: order.quantity,
      executedPrice: fillPrice,
      status: "FILLED",
      broker: this.id,
      timestamp: new Date().toISOString(),
    };
  }

  public async closeOrder(orderId: string, quantity?: number): Promise<OrderResult> {
    let targetPos: BrokerPosition | undefined;
    for (const pos of Array.from(this.positions.values())) {
      if (pos.positionId === orderId || pos.symbol === orderId) {
        targetPos = pos;
        break;
      }
    }

    if (!targetPos) {
      return {
        success: false,
        orderId,
        symbol: "UNKNOWN",
        action: "SELL",
        executedQty: 0,
        executedPrice: 0,
        status: "REJECTED",
        broker: this.id,
        errorMessage: `Position ${orderId} not found`,
        timestamp: new Date().toISOString(),
      };
    }

    const closeQty = quantity ?? targetPos.quantity;
    const closePrice = targetPos.currentPrice;

    if (closeQty >= targetPos.quantity) {
      this.positions.delete(targetPos.symbol);
    } else {
      targetPos.quantity -= closeQty;
    }

    const pnl =
      targetPos.side === "LONG"
        ? (closePrice - targetPos.entryPrice) * closeQty
        : (targetPos.entryPrice - closePrice) * closeQty;

    this.balance += pnl;
    this.equity += pnl;

    logger.info({ orderId, symbol: targetPos.symbol, closeQty, closePrice, pnl }, "Paper Broker closed position");

    return {
      success: true,
      orderId,
      symbol: targetPos.symbol,
      action: targetPos.side === "LONG" ? "SELL" : "BUY",
      executedQty: closeQty,
      executedPrice: closePrice,
      status: "FILLED",
      broker: this.id,
      timestamp: new Date().toISOString(),
    };
  }

  public async modifyOrder(
    orderId: string,
    params: { stopLoss?: number; takeProfit?: number },
  ): Promise<OrderResult> {
    let targetPos: BrokerPosition | undefined;
    for (const pos of Array.from(this.positions.values())) {
      if (pos.positionId === orderId || pos.symbol === orderId) {
        targetPos = pos;
        break;
      }
    }

    if (!targetPos) {
      return {
        success: false,
        orderId,
        symbol: "UNKNOWN",
        action: "BUY",
        executedQty: 0,
        executedPrice: 0,
        status: "REJECTED",
        broker: this.id,
        errorMessage: `Position ${orderId} not found for modification`,
        timestamp: new Date().toISOString(),
      };
    }

    if (params.stopLoss !== undefined) targetPos.stopLoss = params.stopLoss;
    if (params.takeProfit !== undefined) targetPos.takeProfit = params.takeProfit;

    return {
      success: true,
      orderId,
      symbol: targetPos.symbol,
      action: targetPos.side === "LONG" ? "BUY" : "SELL",
      executedQty: targetPos.quantity,
      executedPrice: targetPos.entryPrice,
      status: "FILLED",
      broker: this.id,
      timestamp: new Date().toISOString(),
    };
  }

  public async getPositions(symbol?: string): Promise<BrokerPosition[]> {
    const list = Array.from(this.positions.values());
    if (symbol) {
      return list.filter((p) => p.symbol === symbol);
    }
    return list;
  }

  public async getBalance(): Promise<BrokerAccountBalance> {
    let openUnrealizedPnl = 0;
    let marginUsed = 0;

    for (const pos of Array.from(this.positions.values())) {
      const pnl =
        pos.side === "LONG"
          ? (pos.currentPrice - pos.entryPrice) * pos.quantity
          : (pos.entryPrice - pos.currentPrice) * pos.quantity;
      pos.unrealizedPnl = pnl;
      openUnrealizedPnl += pnl;
      marginUsed += (pos.quantity * pos.entryPrice) / 30; // 1:30 leverage margin requirement simulation
    }

    this.equity = this.balance + openUnrealizedPnl;

    return {
      broker: this.id,
      balance: this.balance,
      equity: this.equity,
      marginUsed,
      freeMargin: Math.max(0, this.equity - marginUsed),
      currency: "USD",
    };
  }
}
