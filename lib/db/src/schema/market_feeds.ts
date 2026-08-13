import { pgTable, serial, text, real, timestamp, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const marketFeedsTable = pgTable(
  "market_feeds",
  {
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
    // Defaults to insert time (e.g. a tick captured live), but callers that know
    // the event's real time -- a candle's open_time, a backfill row -- should
    // pass it explicitly so history isn't stamped with whenever it happened to
    // be ingested.
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Lets the live feed and the historical backfill both call insert
    // unconditionally: re-posting a candle that's already stored (a scan
    // re-fetching the same still-open bar, a re-run backfill) is a no-op
    // instead of a duplicate row.
    uniqueIndex("market_feeds_symbol_feed_type_timestamp_idx").on(table.symbol, table.feedType, table.timestamp),
  ],
);

export const insertMarketFeedSchema = createInsertSchema(marketFeedsTable).omit({ id: true, timestamp: true });
export type InsertMarketFeed = z.infer<typeof insertMarketFeedSchema>;
export type MarketFeedRow = typeof marketFeedsTable.$inferSelect;
