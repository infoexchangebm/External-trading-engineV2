import { pgTable, serial, text, real, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tradesTable = pgTable("trades", {
  id: serial("id").primaryKey(),
  tradeId: text("trade_id").notNull().unique(),
  symbol: text("symbol").notNull(),
  action: text("action").notNull(), // BUY | SELL
  status: text("status").notNull().default("INIT"), // INIT | VALIDATED | EXECUTED | MANAGED | CLOSED | ERROR
  quantity: real("quantity").notNull(),
  entryPrice: real("entry_price"),
  exitPrice: real("exit_price"),
  stopLoss: real("stop_loss"),
  takeProfit: real("take_profit"),
  pnl: real("pnl").default(0),
  pnlPercent: real("pnl_percent").default(0),
  broker: text("broker").notNull().default("paper"),
  brokerOrderId: text("broker_order_id"),
  assetClass: text("asset_class").notNull().default("FX"), // FX | COMMODITIES | CRYPTO | EQUITIES
  stateHistory: jsonb("state_history").$type<Array<{ state: string; timestamp: string; reason?: string; metadata?: Record<string, unknown> }>>(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTradeSchema = createInsertSchema(tradesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTrade = z.infer<typeof insertTradeSchema>;
export type Trade = typeof tradesTable.$inferSelect;
