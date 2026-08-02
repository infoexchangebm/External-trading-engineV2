export interface OrderRequest {
  symbol: string;
  action: "BUY" | "SELL";
  type: "MARKET" | "LIMIT" | "STOP";
  quantity: number;
  price?: number;
  stopLoss?: number;
  takeProfit?: number;
  clientOrderId?: string;
}

export interface OrderResult {
  success: boolean;
  orderId: string;
  symbol: string;
  action: "BUY" | "SELL";
  executedQty: number;
  executedPrice: number;
  status: "FILLED" | "PARTIAL" | "REJECTED" | "CANCELLED";
  broker: string;
  errorMessage?: string;
  timestamp: string;
}

export interface BrokerPosition {
  positionId: string;
  symbol: string;
  side: "LONG" | "SHORT";
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  stopLoss?: number;
  takeProfit?: number;
  unrealizedPnl: number;
  broker: string;
}

export interface BrokerAccountBalance {
  broker: string;
  balance: number;
  equity: number;
  marginUsed: number;
  freeMargin: number;
  currency: string;
}

export interface IBrokerAdapter {
  id: string;
  name: string;
  placeOrder(order: OrderRequest): Promise<OrderResult>;
  closeOrder(orderId: string, quantity?: number): Promise<OrderResult>;
  modifyOrder(orderId: string, params: { stopLoss?: number; takeProfit?: number }): Promise<OrderResult>;
  getPositions(symbol?: string): Promise<BrokerPosition[]>;
  getBalance(): Promise<BrokerAccountBalance>;
}
