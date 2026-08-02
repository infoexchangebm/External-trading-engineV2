import { pgTable, serial, text, real, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const observabilityLogsTable = pgTable("observability_logs", {
  id: serial("id").primaryKey(),
  category: text("category").notNull(), // STRATEGY | EXECUTION | RISK | ERROR | SYSTEM
  level: text("level").notNull().default("INFO"), // INFO | WARN | ERROR | FATAL
  message: text("message").notNull(),
  symbol: text("symbol"),
  tradeId: text("trade_id"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
});

export const metricsSnapshotsTable = pgTable("metrics_snapshots", {
  id: serial("id").primaryKey(),
  winRate: real("win_rate").notNull().default(0),
  totalTrades: serial("total_trades"),
  maxDrawdown: real("max_drawdown").notNull().default(0),
  totalExposureUsd: real("total_exposure_usd").notNull().default(0),
  averageLatencyMs: real("average_latency_ms").notNull().default(0),
  volatilityIndex: real("volatility_index").notNull().default(0),
  profitFactor: real("profit_factor").notNull().default(0),
  sharpeRatio: real("sharpe_ratio").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertObservabilityLogSchema = createInsertSchema(observabilityLogsTable).omit({ id: true, timestamp: true });
export type InsertObservabilityLog = z.infer<typeof insertObservabilityLogSchema>;
export type ObservabilityLogRow = typeof observabilityLogsTable.$inferSelect;
