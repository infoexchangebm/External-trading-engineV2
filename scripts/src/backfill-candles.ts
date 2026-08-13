/**
 * One-off historical backfill for market_feeds.
 *
 * The live feed (app/data_sources/prices.py) only ever persists each closed
 * candle once, as it happens -- there was never any history before this
 * script ran for the first time. This walks Binance's public klines
 * endpoint backward in time and bulk-inserts straight into Postgres via
 * @workspace/db (the same table/schema the live feed and the API route
 * use), rather than looping HTTP calls through the Node API -- chosen for
 * throughput on a one-off bulk load rather than the live feed's steady
 * trickle of single rows.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts backfill -- --symbols BTCUSDT,ETHUSDT --days 90 --interval 15m
 *
 * Idempotent: re-running (e.g. after a partial failure) just no-ops on
 * candles already stored, via the same (symbol, feedType, timestamp)
 * unique index the live feed relies on.
 */
import { db, marketFeedsTable, pool } from "@workspace/db";

const BINANCE_BASE_URL = (process.env["BINANCE_BASE_URL"] ?? "https://api.binance.com").replace(/\/+$/, "");
const DEFAULT_SYMBOLS = ["BTCUSDT", "ETHUSDT"];
const DEFAULT_DAYS = 90;
const DEFAULT_INTERVAL = "15m";
const PAGE_LIMIT = 1000; // Binance's max klines per request.
const REQUEST_DELAY_MS = 250; // polite pacing, well under Binance's public rate limit.

interface Args {
  symbols: string[];
  days: number;
  interval: string;
}

function parseArgs(argv: string[]): Args {
  const raw: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token?.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      raw[key] = next;
      i++;
    } else {
      raw[key] = "true";
    }
  }

  const symbols = (raw["symbols"] ?? DEFAULT_SYMBOLS.join(","))
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const days = Number(raw["days"] ?? DEFAULT_DAYS);
  const interval = raw["interval"] ?? DEFAULT_INTERVAL;

  if (symbols.length === 0) {
    throw new Error("--symbols resolved to an empty list");
  }
  if (!Number.isFinite(days) || days <= 0) {
    throw new Error(`--days must be a positive number, got ${raw["days"]}`);
  }
  return { symbols, days, interval };
}

// [openTime, open, high, low, close, volume, closeTime, ...]
type Kline = [number, string, string, string, string, string, number, ...unknown[]];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchKlinePage(symbol: string, interval: string, endTime: number): Promise<Kline[]> {
  const url = new URL("/api/v3/klines", BINANCE_BASE_URL);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("interval", interval);
  url.searchParams.set("limit", String(PAGE_LIMIT));
  url.searchParams.set("endTime", String(endTime));

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Binance klines request failed for ${symbol}: ${response.status} ${await response.text()}`);
  }
  return (await response.json()) as Kline[];
}

async function insertPage(symbol: string, interval: string, rows: Kline[]): Promise<number> {
  const now = Date.now();
  const values = rows
    // Drop any still-forming candle (close_time in the future) so we never
    // freeze a partial bar into history -- mirrors the live feed's rule.
    .filter(([, , , , , , closeTime]) => closeTime <= now)
    .map(([openTime, open, high, low, close, volume]) => ({
      symbol,
      feedType: "CANDLE" as const,
      price: Number(close),
      timestamp: new Date(openTime),
      payload: {
        interval,
        open: Number(open),
        high: Number(high),
        low: Number(low),
        close: Number(close),
        volume: Number(volume),
      },
    }));

  if (values.length === 0) return 0;

  const inserted = await db
    .insert(marketFeedsTable)
    .values(values)
    .onConflictDoNothing({
      target: [marketFeedsTable.symbol, marketFeedsTable.feedType, marketFeedsTable.timestamp],
    })
    .returning({ id: marketFeedsTable.id });

  return inserted.length;
}

async function backfillSymbol(symbol: string, interval: string, days: number): Promise<void> {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  let endTime = Date.now();
  let totalFetched = 0;
  let totalInserted = 0;
  let page = 0;

  console.log(`[${symbol}] backfilling ${days}d of ${interval} candles back to ${new Date(cutoff).toISOString()}`);

  for (;;) {
    page++;
    const rows = await fetchKlinePage(symbol, interval, endTime);
    if (rows.length === 0) {
      console.log(`[${symbol}] page ${page}: no more candles from Binance, stopping`);
      break;
    }

    const inWindow = rows.filter(([openTime]) => openTime >= cutoff);
    totalFetched += inWindow.length;
    totalInserted += await insertPage(symbol, interval, inWindow);

    const earliestOpenTime = rows[0]?.[0] ?? cutoff;
    console.log(
      `[${symbol}] page ${page}: fetched ${rows.length} (${inWindow.length} in window), ` +
        `earliest ${new Date(earliestOpenTime).toISOString()}, running total inserted ${totalInserted}`,
    );

    if (earliestOpenTime <= cutoff || rows.length < PAGE_LIMIT) {
      break; // reached the requested window, or Binance has no earlier data.
    }

    endTime = earliestOpenTime - 1;
    await sleep(REQUEST_DELAY_MS);
  }

  console.log(`[${symbol}] done: ${totalFetched} candles in window, ${totalInserted} new rows inserted`);
}

async function main(): Promise<void> {
  const { symbols, days, interval } = parseArgs(process.argv.slice(2));
  console.log(`Backfilling ${symbols.join(", ")} @ ${interval} for the last ${days} day(s)`);

  const failures: string[] = [];
  for (const symbol of symbols) {
    try {
      await backfillSymbol(symbol, interval, days);
    } catch (err) {
      failures.push(symbol);
      console.error(`[${symbol}] backfill failed:`, err instanceof Error ? err.message : err);
    }
  }

  await pool.end();

  if (failures.length > 0) {
    console.error(`Completed with failures: ${failures.join(", ")}`);
    process.exitCode = 1;
  } else {
    console.log("Backfill complete.");
  }
}

main().catch((err) => {
  console.error("Backfill script crashed:", err);
  process.exitCode = 1;
});
