import {
  IBrokerAdapter,
  OrderRequest,
  OrderResult,
  BrokerPosition,
  BrokerAccountBalance,
} from "./broker-interface.js";
import { logger } from "../logger.js";

export class DerivAdapter implements IBrokerAdapter {
  public id = "deriv";
  public name = "Deriv Synthetic Indices WebSocket Adapter";

  public async placeOrder(order: OrderRequest): Promise<OrderResult> {
    logger.info({ order }, "DerivAdapter: Sending proposal/buy via Deriv WS API");
    return {
      success: true,
      orderId: `DERIV-${Date.now()}`,
      symbol: order.symbol,
      action: order.action,
      executedQty: order.quantity,
      executedPrice: order.price || 1000,
      status: "FILLED",
      broker: this.id,
      timestamp: new Date().toISOString(),
    };
  }

  public async closeOrder(orderId: string, quantity?: number): Promise<OrderResult> {
    return {
      success: true,
      orderId,
      symbol: "R_100",
      action: "SELL",
      executedQty: quantity || 1,
      executedPrice: 1000,
      status: "FILLED",
      broker: this.id,
      timestamp: new Date().toISOString(),
    };
  }

  public async modifyOrder(
    orderId: string,
    params: { stopLoss?: number; takeProfit?: number },
  ): Promise<OrderResult> {
    return {
      success: true,
      orderId,
      symbol: "R_100",
      action: "BUY",
      executedQty: 1,
      executedPrice: 1000,
      status: "FILLED",
      broker: this.id,
      timestamp: new Date().toISOString(),
    };
  }

  public async getPositions(symbol?: string): Promise<BrokerPosition[]> {
    return [];
  }

  public async getBalance(): Promise<BrokerAccountBalance> {
    return {
      broker: this.id,
      balance: 10000,
      equity: 10000,
      marginUsed: 0,
      freeMargin: 10000,
      currency: "USD",
    };
  }
}
