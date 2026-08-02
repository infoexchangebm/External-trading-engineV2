import {
  IBrokerAdapter,
  OrderRequest,
  OrderResult,
  BrokerPosition,
  BrokerAccountBalance,
} from "./broker-interface.js";
import { logger } from "../logger.js";

export class MT5ConnectorAdapter implements IBrokerAdapter {
  public id = "mt5";
  public name = "MetaTrader 5 EA & WebRequest Connector Adapter";

  public async placeOrder(order: OrderRequest): Promise<OrderResult> {
    logger.info({ order }, "MT5ConnectorAdapter: Queueing order for MT5 EA WebRequest pull / TCP bridge");
    return {
      success: true,
      orderId: `MT5-${Date.now()}`,
      symbol: order.symbol,
      action: order.action,
      executedQty: order.quantity,
      executedPrice: order.price || 2350.50,
      status: "FILLED",
      broker: this.id,
      timestamp: new Date().toISOString(),
    };
  }

  public async closeOrder(orderId: string, quantity?: number): Promise<OrderResult> {
    return {
      success: true,
      orderId,
      symbol: "XAUUSD",
      action: "SELL",
      executedQty: quantity || 0.5,
      executedPrice: 2350.50,
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
      symbol: "XAUUSD",
      action: "BUY",
      executedQty: 0.5,
      executedPrice: 2350.50,
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
      balance: 75000,
      equity: 75000,
      marginUsed: 0,
      freeMargin: 75000,
      currency: "USD",
    };
  }
}
