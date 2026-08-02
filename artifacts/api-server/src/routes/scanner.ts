import { Router } from "express";
import { db } from "@workspace/db";
import { engineConfigTable } from "@workspace/db/schema";
import { fetchNews } from "../lib/scanner/news-fetcher.js";
import { fetchRvol } from "../lib/scanner/rvol-screener.js";
import { fetchMomentum } from "../lib/scanner/momentum-screener.js";
import { fetchOptionsFlow } from "../lib/scanner/options-pressure.js";
import { scannerLoop } from "../lib/engine/scanner-loop.js";

const router = Router();

/** Read tracked symbols from engine config, fallback to defaults */
async function getDefaultSymbols(): Promise<string[]> {
  try {
    const rows = await db.select().from(engineConfigTable).limit(1);
    const row = rows[0];
    if (row?.symbols) {
      const parsed = row.symbols.split(",").map((s) => s.trim()).filter(Boolean);
      if (parsed.length > 0) return parsed;
    }
  } catch {}
  return ["AAPL", "BTCUSDT", "ETHUSDT"];
}

function parseSymbols(param: string | undefined, defaults: string[]): string[] {
  if (!param) return defaults;
  const parsed = param.split(",").map((s) => s.trim()).filter(Boolean);
  return parsed.length > 0 ? parsed : defaults;
}

// GET /scanner/health - Continuous background engine health & diagnostic state
router.get("/scanner/health", (_req, res) => {
  res.json(scannerLoop.getHealth());
});

// POST /scanner/start - Start continuous background engine
router.post("/scanner/start", (req, res) => {
  const intervalMs = req.body?.intervalMs ? Number(req.body.intervalMs) : 60000;
  scannerLoop.start(intervalMs);
  res.json({ message: "Scanner loop started", health: scannerLoop.getHealth() });
});

// POST /scanner/stop - Stop continuous background engine
router.post("/scanner/stop", (_req, res) => {
  scannerLoop.stop();
  res.json({ message: "Scanner loop stopped", health: scannerLoop.getHealth() });
});

// POST /scanner/trigger - Trigger instant scan cycle
router.post("/scanner/trigger", async (_req, res) => {
  const signals = await scannerLoop.runScanCycle();
  res.json({ message: "Scan cycle completed", count: signals.length, signals });
});

// GET /scanner/news
router.get("/scanner/news", async (req, res) => {
  const defaults = await getDefaultSymbols();
  const symbols = parseSymbols(req.query["symbols"] as string | undefined, defaults);
  const items = await fetchNews(symbols);
  res.json(items);
});

// GET /scanner/rvol
router.get("/scanner/rvol", async (req, res) => {
  const defaults = await getDefaultSymbols();
  const symbols = parseSymbols(req.query["symbols"] as string | undefined, defaults);
  const entries = await fetchRvol(symbols);
  res.json(entries);
});

// GET /scanner/momentum
router.get("/scanner/momentum", async (req, res) => {
  const defaults = await getDefaultSymbols();
  const symbols = parseSymbols(req.query["symbols"] as string | undefined, defaults);
  const entries = await fetchMomentum(symbols);
  res.json(entries);
});

// GET /scanner/options-flow?symbol=AAPL
router.get("/scanner/options-flow", async (req, res) => {
  const symbol = req.query["symbol"] as string | undefined;
  if (!symbol) {
    res.status(400).json({ error: "symbol query param required" });
    return;
  }
  const flow = await fetchOptionsFlow(symbol);
  res.json(flow);
});

export default router;
