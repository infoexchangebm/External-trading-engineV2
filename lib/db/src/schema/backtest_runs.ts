import { pgTable, serial, text, real, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const backtestRunsTable = pgTable("backtest_runs", {
  id: serial("id").primaryKey(),
  runId: text("run_id").notNull().unique(),
  symbol: text("symbol").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  initialBalance: real("initial_balance").notNull(),
  finalBalance: real("final_balance").notNull(),
  totalReturnPercent: real("total_return_percent").notNull(),
  maxDrawdownPercent: real("max_drawdown_percent").notNull(),
  winRatePercent: real("win_rate_percent").notNull(),
  totalTrades: real("total_trades").notNull(),
  profitFactor: real("profit_factor").notNull(),
  sharpeRatio: real("sharpe_ratio").notNull(),
  tradesLog: jsonb("trades_log").$type<Array<Record<string, unknown>>>(),
  equityCurve: jsonb("equity_curve").$type<Array<{ timestamp: string; equity: number; drawdown: number }>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertBacktestRunSchema = createInsertSchema(backtestRunsTable).omit({ id: true, createdAt: true });
export type InsertBacktestRun = z.infer<typeof insertBacktestRunSchema>;
export type BacktestRunRow = typeof backtestRunsTable.$inferSelect;
