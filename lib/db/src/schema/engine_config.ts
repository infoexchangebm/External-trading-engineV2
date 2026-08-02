import { pgTable, serial, text, real, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const engineConfigTable = pgTable("engine_config", {
  id: serial("id").primaryKey(),
  symbols: text("symbols").notNull().default("EURUSD,GBPUSD,XAUUSD,AAPL,SPY,CL=F,BTCUSD"),
  tradingViewWebhookUrl: text("tradingview_webhook_url").notNull().default(""),
  macroWeight: real("macro_weight").notNull().default(0.25),
  orderbookWeight: real("orderbook_weight").notNull().default(0.30),
  earningsWeight: real("earnings_weight").notNull().default(0.15),
  technicalWeight: real("technical_weight").notNull().default(0.30),
  signalThreshold: real("signal_threshold").notNull().default(0.4),
  autoSendEnabled: boolean("auto_send_enabled").notNull().default(false),
  atrSlMultiplier: real("atr_sl_multiplier").notNull().default(1.5),
  atrTpMultiplier: real("atr_tp_multiplier").notNull().default(3.0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertEngineConfigSchema = createInsertSchema(engineConfigTable).omit({ id: true, updatedAt: true });
export type InsertEngineConfig = z.infer<typeof insertEngineConfigSchema>;
export type EngineConfig = typeof engineConfigTable.$inferSelect;
