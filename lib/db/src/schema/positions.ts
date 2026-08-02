import { pgTable, serial, text, real, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const positionsTable = pgTable("positions", {
  id: serial("id").primaryKey(),
  positionId: text("position_id").notNull().unique(),
  tradeId: text("trade_id").notNull(),
  symbol: text("symbol").notNull(),
  side: text("side").notNull(), // LONG | SHORT
  currentQty: real("current_qty").notNull(),
  initialQty: real("initial_qty").notNull(),
  entryPrice: real("entry_price").notNull(),
  currentPrice: real("current_price").notNull(),
  stopLoss: real("stop_loss"),
  takeProfit: real("take_profit"),
  trailingStopDistance: real("trailing_stop_distance"),
  isBreakEvenTriggered: boolean("is_break_even_triggered").notNull().default(false),
  partialTpSteps: jsonb("partial_tp_steps").$type<Array<{ targetPrice: number; closePercent: number; executed: boolean }>>(),
  unrealizedPnl: real("unrealized_pnl").notNull().default(0),
  broker: text("broker").notNull().default("paper"),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPositionSchema = createInsertSchema(positionsTable).omit({ id: true, openedAt: true, updatedAt: true });
export type InsertPosition = z.infer<typeof insertPositionSchema>;
export type PositionRow = typeof positionsTable.$inferSelect;
