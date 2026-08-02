import { pgTable, serial, text, real, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const marketFeedsTable = pgTable("market_feeds", {
  id: serial("id").primaryKey(),
  symbol: text("symbol").notNull(),
  feedType: text("feed_type").notNull(), // TICK | CANDLE | ORDERBOOK | VOLATILITY | SENTIMENT | CALENDAR
  price: real("price"),
  bid: real("bid"),
  ask: real("ask"),
  volatilityAtr: real("volatility_atr"),
  vixValue: real("vix_value"),
  orderbookImbalance: real("orderbook_imbalance"),
  sentimentScore: real("sentiment_score"),
  calendarEvents: jsonb("calendar_events").$type<Array<{ title: string; impact: "HIGH" | "MEDIUM" | "LOW"; time: string }>>(),
  payload: jsonb("payload").$type<Record<string, unknown>>(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMarketFeedSchema = createInsertSchema(marketFeedsTable).omit({ id: true, timestamp: true });
export type InsertMarketFeed = z.infer<typeof insertMarketFeedSchema>;
export type MarketFeedRow = typeof marketFeedsTable.$inferSelect;
