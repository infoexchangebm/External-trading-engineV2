import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const webhookLogsTable = pgTable("webhook_logs", {
  id: serial("id").primaryKey(),
  direction: text("direction").notNull(), // inbound | outbound
  payload: text("payload").notNull(),
  status: text("status").notNull(), // success | error | received
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertWebhookLogSchema = createInsertSchema(webhookLogsTable).omit({ id: true, createdAt: true });
export type InsertWebhookLog = z.infer<typeof insertWebhookLogSchema>;
export type WebhookLog = typeof webhookLogsTable.$inferSelect;
