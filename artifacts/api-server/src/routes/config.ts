import { Router, type IRouter } from "express";
import { db, engineConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { UpdateConfigBody, GetConfigResponse, UpdateConfigResponse } from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router: IRouter = Router();

async function ensureConfig() {
  const [existing] = await db.select().from(engineConfigTable).limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(engineConfigTable)
    .values({
      symbols: "BTCUSDT,ETHUSDT,AAPL",
      tradingViewWebhookUrl: "",
      macroWeight: 0.25,
      orderbookWeight: 0.30,
      earningsWeight: 0.15,
      technicalWeight: 0.30,
      signalThreshold: 0.4,
      autoSendEnabled: false,
    })
    .returning();
  return created;
}

function parseSymbolsArray(config: { symbols: string; [key: string]: unknown }) {
  return (config.symbols ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

router.get("/config", async (req, res): Promise<void> => {
  const config = await ensureConfig();
  res.json(GetConfigResponse.parse({ ...config, symbols: parseSymbolsArray(config) }));
});

router.put("/config", async (req, res): Promise<void> => {
  const parsed = UpdateConfigBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const current = await ensureConfig();
  const d = parsed.data;

  const [updated] = await db
    .update(engineConfigTable)
    .set({
      ...(d.symbols !== undefined && { symbols: d.symbols.join(",") }),
      ...(d.tradingViewWebhookUrl !== undefined && { tradingViewWebhookUrl: d.tradingViewWebhookUrl }),
      ...(d.macroWeight !== undefined && { macroWeight: d.macroWeight }),
      ...(d.orderbookWeight !== undefined && { orderbookWeight: d.orderbookWeight }),
      ...(d.earningsWeight !== undefined && { earningsWeight: d.earningsWeight }),
      ...(d.technicalWeight !== undefined && { technicalWeight: d.technicalWeight }),
      ...(d.signalThreshold !== undefined && { signalThreshold: d.signalThreshold }),
      ...(d.autoSendEnabled !== undefined && { autoSendEnabled: d.autoSendEnabled }),
    })
    .where(eq(engineConfigTable.id, current.id))
    .returning();

  if (!updated) {
    res.status(500).json({ error: "Failed to update config" });
    return;
  }

  logger.info("Engine config updated");
  res.json(UpdateConfigResponse.parse({ ...updated, symbols: parseSymbolsArray(updated) }));
});

export default router;
