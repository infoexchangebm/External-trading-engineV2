import { db, tradesTable, positionsTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import {
  IBrokerAdapter,
  OrderRequest,
  OrderResult,
  BrokerPosition,
  BrokerAccountBalance,
} from "./broker-interface.js";
import { inferAssetClass } from "../risk/infer-asset-class.js";
import { logger } from "../logger.js";

const STARTING_BALANCE = 100000;

export class PaperBrokerAdapter implements IBrokerAdapter {
  public id = "paper";
  public name = "Internal Paper Simulation Broker";

  private balance = STARTING_BALANCE;
  private equity = STARTING_BALANCE;
  private positions: Map<string, BrokerPosition> = new Map();
  private orderCounter = 1000;
  private initialized = false;

  /**
   * Hydrate balance/positions from Postgres. Previously this class kept
   * state purely in memory, so every container restart silently reset an
   * account back to a fresh $100k with no open positions and no history —
   * call this once at startup (see index.ts) before the server accepts
   * requests.
   *
   * Balance is recomputed as starting balance + sum(closed trade pnl)
   * rather than stored directly: there's no dedicated balance/ledger table
   * in the schema, and deriving it from the trades log keeps a single
   * source of truth instead of two numbers that can drift apart.
   */
  public async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    try {
      const openPositions = await db
        .select()
        .from(positionsTable)
        .where(eq(positionsTable.broker, this.id));

      for (const row of openPositions) {
        this.positions.set(row.symbol, {
          positionId: row.positionId,
          symbol: row.symbol,
          side: row.side as "LONG" | "SHORT",
          quantity: row.currentQty,
          entryPrice: row.entryPrice,
          currentPrice: row.currentPrice,
          stopLoss: row.stopLoss ?? undefined,
          takeProfit: row.takeProfit ?? undefined,
          unrealizedPnl: row.unrealizedPnl,
          broker: this.id,
        });
      }

      const [{ realizedPnl }] = await db
        .select({ realizedPnl: sql<number>`coalesce(sum(${tradesTable.pnl}), 0)` })
        .from(tradesTable)
        .where(and(eq(tradesTable.broker, this.id), eq(tradesTable.status, "CLOSED")));

      this.balance = STARTING_BALANCE + (realizedPnl ?? 0);
      this.equity = this.balance;

      // Order counter must not collide with orderIds already persisted.
      const rows = await db
        .select({ brokerOrderId: tradesTable.brokerOrderId })
        .from(tradesTable)
        .where(eq(tradesTable.broker, this.id));
      for (const { brokerOrderId } of rows) {
        const match = brokerOrderId?.match(/^PAPER-(\d+)$/);
        if (match) this.orderCounter = Math.max(this.orderCounter, Number(match[1]));
      }

      logger.info(
        { positions: this.positions.size, balance: this.balance },
        "Paper broker hydrated from Postgres",
      );
    } catch (err) {
      logger.error({ err }, "Paper broker hydration failed - starting from a fresh account");
    }
  }

  /**
   * Persist an execution event to the trades table. This is an append-only
   * fills log, not a matched round-trip ledger: one row per placeOrder call
   * and one row per closeOrder call. Matching entries to exits under
   * partial fills/multiple adds (FIFO/LIFO lot accounting) is a real
   * sub-project on its own — this gives honest, queryable history of every
   * fill without pretending to solve that.
   */
  private async recordTrade(row: {
    tradeId: string;
    symbol: string;
    action: "BUY" | "SELL";
    status: "EXECUTED" | "CLOSED";
    quantity: number;
    entryPrice?: number;
    exitPrice?: number;
    stopLoss?: number;
    takeProfit?: number;
    pnl?: number;
    brokerOrderId: string;
    closedAt?: Date;
  }): Promise<void> {
    try {
      await db.insert(tradesTable).values({
        tradeId: row.tradeId,
        symbol: row.symbol,
        action: row.action,
        status: row.status,
        quantity: row.quantity,
        entryPrice: row.entryPrice ?? null,
        exitPrice: row.exitPrice ?? null,
        stopLoss: row.stopLoss ?? null,
        takeProfit: row.takeProfit ?? null,
        pnl: row.pnl ?? 0,
        pnlPercent:
          row.pnl !== undefined && row.entryPrice ? (row.pnl / (row.entryPrice * row.quantity)) * 100 : 0,
        broker: this.id,
        brokerOrderId: row.brokerOrderId,
        assetClass: inferAssetClass(row.symbol),
        closedAt: row.closedAt ?? null,
      });
    } catch (err) {
      // A failed history write must never block the fill itself — the
      // in-memory result already returned success to the caller.
      logger.error({ err, tradeId: row.tradeId }, "Failed to persist trade row");
    }
  }

  private async upsertPositionRow(pos: BrokerPosition, tradeId: string): Promise<void> {
    try {
      await db
        .insert(positionsTable)
        .values({
          positionId: pos.positionId,
          tradeId,
          symbol: pos.symbol,
          side: pos.side,
          currentQty: pos.quantity,
          initialQty: pos.quantity,
          entryPrice: pos.entryPrice,
          currentPrice: pos.currentPrice,
          stopLoss: pos.stopLoss ?? null,
          takeProfit: pos.takeProfit ?? null,
          unrealizedPnl: pos.unrealizedPnl,
          broker: this.id,
        })
        .onConflictDoUpdate({
          target: positionsTable.positionId,
          set: {
            currentQty: pos.quantity,
            entryPrice: pos.entryPrice,
            currentPrice: pos.currentPrice,
            stopLoss: pos.stopLoss ?? null,
            takeProfit: pos.takeProfit ?? null,
            unrealizedPnl: pos.unrealizedPnl,
            updatedAt: new Date(),
          },
        });
    } catch (err) {
      logger.error({ err, positionId: pos.positionId }, "Failed to persist position row");
    }
  }

  private async deletePositionRow(positionId: string): Promise<void> {
    try {
      await db.delete(positionsTable).where(eq(positionsTable.positionId, positionId));
    } catch (err) {
      logger.error({ err, positionId }, "Failed to delete closed position row");
    }
  }

  public async placeOrder(order: OrderRequest): Promise<OrderResult> {
    this.orderCounter++;
    const orderId = `PAPER-${this.orderCounter}`;
    const tradeId = order.clientOrderId ?? orderId;
    const fillPrice = order.price || 1.1050; // default fallback execution price
    const notional = order.quantity * fillPrice;

    const side = order.action === "BUY" ? "LONG" : "SHORT";
    const existing = this.positions.get(order.symbol);
    let resultingPosition: BrokerPosition | undefined;

    if (existing) {
      if (existing.side === side) {
        // Add to existing position
        const totalQty = existing.quantity + order.quantity;
        const avgPrice = (existing.quantity * existing.entryPrice + notional) / totalQty;
        existing.quantity = totalQty;
        existing.entryPrice = avgPrice;
        existing.stopLoss = order.stopLoss ?? existing.stopLoss;
        existing.takeProfit = order.takeProfit ?? existing.takeProfit;
        resultingPosition = existing;
      } else {
        // Partial or full reversal
        if (order.quantity >= existing.quantity) {
          const remQty = order.quantity - existing.quantity;
          this.positions.delete(order.symbol);
          await this.deletePositionRow(existing.positionId);
          if (remQty > 0) {
            resultingPosition = {
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
            };
            this.positions.set(order.symbol, resultingPosition);
          }
        } else {
          existing.quantity -= order.quantity;
          resultingPosition = existing;
        }
      }
    } else {
      // New position
      resultingPosition = {
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
      };
      this.positions.set(order.symbol, resultingPosition);
    }

    if (resultingPosition) {
      await this.upsertPositionRow(resultingPosition, tradeId);
    }

    await this.recordTrade({
      tradeId,
      symbol: order.symbol,
      action: order.action,
      status: "EXECUTED",
      quantity: order.quantity,
      entryPrice: fillPrice,
      stopLoss: order.stopLoss,
      takeProfit: order.takeProfit,
      brokerOrderId: orderId,
    });

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

    const fullyClosed = closeQty >= targetPos.quantity;
    if (fullyClosed) {
      this.positions.delete(targetPos.symbol);
      await this.deletePositionRow(targetPos.positionId);
    } else {
      targetPos.quantity -= closeQty;
      await this.upsertPositionRow(targetPos, `CLOSE-${targetPos.positionId}-${Date.now()}`);
    }

    const pnl =
      targetPos.side === "LONG"
        ? (closePrice - targetPos.entryPrice) * closeQty
        : (targetPos.entryPrice - closePrice) * closeQty;

    this.balance += pnl;
    this.equity += pnl;

    const closeOrderId = `PAPER-CLOSE-${++this.orderCounter}`;
    await this.recordTrade({
      tradeId: `CLOSE-${targetPos.positionId}-${Date.now()}`,
      symbol: targetPos.symbol,
      action: targetPos.side === "LONG" ? "SELL" : "BUY",
      status: "CLOSED",
      quantity: closeQty,
      entryPrice: targetPos.entryPrice,
      exitPrice: closePrice,
      pnl,
      brokerOrderId: closeOrderId,
      closedAt: new Date(),
    });

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

    await db
      .update(positionsTable)
      .set({
        stopLoss: targetPos.stopLoss ?? null,
        takeProfit: targetPos.takeProfit ?? null,
        updatedAt: new Date(),
      })
      .where(eq(positionsTable.positionId, targetPos.positionId))
      .catch((err) => logger.error({ err, positionId: targetPos!.positionId }, "Failed to persist SL/TP update"));

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
