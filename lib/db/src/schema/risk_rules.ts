import { pgTable, serial, real, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const riskRulesTable = pgTable("risk_rules", {
  id: serial("id").primaryKey(),
  maxDailyLossUsd: real("max_daily_loss_usd").notNull().default(1000),
  maxWeeklyLossUsd: real("max_weekly_loss_usd").notNull().default(3000),
  maxPositionSizeUsd: real("max_position_size_usd").notNull().default(50000),
  maxAssetExposureUsd: real("max_asset_exposure_usd").notNull().default(100000),
  maxFxExposureUsd: real("max_fx_exposure_usd").notNull().default(200000),
  maxGoldExposureUsd: real("max_gold_exposure_usd").notNull().default(100000),
  maxOilExposureUsd: real("max_oil_exposure_usd").notNull().default(100000),
  maxTradesPerHour: integer("max_trades_per_hour").notNull().default(10),
  maxSpreadPips: real("max_spread_pips").notNull().default(3.0),
  maxAtrMultiplier: real("max_atr_multiplier").notNull().default(2.5),
  newsBlackoutMinutesBefore: integer("news_blackout_minutes_before").notNull().default(15),
  newsBlackoutMinutesAfter: integer("news_blackout_minutes_after").notNull().default(15),
  isCircuitBreakerTripped: boolean("is_circuit_breaker_tripped").notNull().default(false),
  circuitBreakerReason: jsonb("circuit_breaker_reason").$type<{ reason: string; timestamp: string }>(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertRiskRulesSchema = createInsertSchema(riskRulesTable).omit({ id: true, updatedAt: true });
export type InsertRiskRules = z.infer<typeof insertRiskRulesSchema>;
export type RiskRulesRow = typeof riskRulesTable.$inferSelect;
