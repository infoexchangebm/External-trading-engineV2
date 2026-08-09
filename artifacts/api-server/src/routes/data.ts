import { Router, type IRouter } from "express";
import { db, engineConfigTable } from "@workspace/db";
import {
  GetOrderbookResponse,
  GetMacroDataResponse,
  GetEarningsDataResponse,
} from "@workspace/api-zod";
import { fetchOrderbook } from "../lib/orderbook-fetcher";
import { fetchMacroData } from "../lib/macro-fetcher";

const router: IRouter = Router();

router.get("/data/orderbook", async (req, res): Promise<void> => {
  const [config] = await db.select().from(engineConfigTable).limit(1);
  const symbolsRaw = config?.symbols ?? "BTCUSDT,ETHUSDT";
  const symbols = symbolsRaw.split(",").map((s: string) => s.trim()).filter(Boolean);

  const entries = await fetchOrderbook(symbols);
  res.json(GetOrderbookResponse.parse(entries));
});

router.get("/data/macro", async (req, res): Promise<void> => {
  const data = await fetchMacroData();
  res.json(GetMacroDataResponse.parse(data));
});

router.get("/data/earnings", async (req, res): Promise<void> => {
  // Finnhub-backed earnings calendar (yfinance not available in Node). No
  // static fallback list: a hardcoded 4-company sample with fixed dates goes
  // stale the moment the clock moves past it and lies about who's actually
  // reporting. An empty array is an honest answer whether there's no key,
  // the fetch fails, or genuinely nobody in-window is reporting — the
  // frontend should render "no upcoming earnings" for all three rather than
  // ever showing fabricated tickers.
  const finnhubKey = process.env["FINNHUB_API_KEY"];

  if (!finnhubKey) {
    res.json(GetEarningsDataResponse.parse([]));
    return;
  }

  try {
    const today = new Date();
    const from = today.toISOString().split("T")[0];
    const toDate = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
    const to = toDate.toISOString().split("T")[0];
    const url = `https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}&token=${finnhubKey}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json() as { earningsCalendar?: { symbol: string; date: string; epsEstimate: number; epsActual: number }[] };
    const entries = (data.earningsCalendar ?? []).slice(0, 20).map((e) => ({
      ticker: e.symbol,
      reportDate: e.date,
      epsEstimate: e.epsEstimate ?? null,
      epsActual: e.epsActual ?? null,
      surprise: e.epsActual != null && e.epsEstimate != null ? parseFloat((e.epsActual - e.epsEstimate).toFixed(2)) : null,
      signal: null,
    }));
    res.json(GetEarningsDataResponse.parse(entries));
  } catch {
    res.json(GetEarningsDataResponse.parse([]));
  }
});

export default router;
