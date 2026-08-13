import { Router } from "express";
import { db, marketFeedsTable } from "@workspace/db";

const router = Router();

// Matches marketFeedsTable.feedType's documented values (see
// lib/db/src/schema/market_feeds.ts).
const VALID_FEED_TYPES = new Set(["TICK", "CANDLE", "ORDERBOOK", "VOLATILITY", "SENTIMENT", "CALENDAR"]);

/**
 * Ingest a market-data snapshot into Postgres so history survives past the
 * lifetime of whichever process fetched it. Written for the Python signal
 * engine's scheduled OHLCV fetch (app/data_sources/prices.py), which used to
 * fetch real candles and then discard them every scan cycle — nothing was
 * ever persisted. Kept generic (feedType-driven) rather than candle-only so
 * the same endpoint can carry orderbook/volatility/sentiment snapshots later
 * without a new route.
 */
router.post("/market-feeds", async (req, res): Promise<void> => {
  const { symbol, feedType, price, bid, ask, payload, timestamp } = (req.body ?? {}) as Record<string, unknown>;

  if (typeof symbol !== "string" || !symbol.trim()) {
    res.status(400).json({ error: "symbol is required" });
    return;
  }
  if (typeof feedType !== "string" || !VALID_FEED_TYPES.has(feedType)) {
    res.status(400).json({ error: `feedType must be one of ${[...VALID_FEED_TYPES].join(", ")}` });
    return;
  }
  if (price !== undefined && typeof price !== "number") {
    res.status(400).json({ error: "price must be a number when provided" });
    return;
  }

  // Optional: the event's own time (a candle's open_time, a backfilled row).
  // Falls back to the column default (now()) for callers that don't know it,
  // e.g. a raw tick captured live.
  let parsedTimestamp: Date | undefined;
  if (timestamp !== undefined) {
    if (typeof timestamp !== "string" && typeof timestamp !== "number") {
      res.status(400).json({ error: "timestamp must be an ISO string or epoch millis when provided" });
      return;
    }
    const candidate = new Date(timestamp);
    if (Number.isNaN(candidate.getTime())) {
      res.status(400).json({ error: "timestamp is not a valid date" });
      return;
    }
    parsedTimestamp = candidate;
  }

  const [saved] = await db
    .insert(marketFeedsTable)
    .values({
      symbol: symbol.toUpperCase().trim(),
      feedType,
      price: typeof price === "number" ? price : null,
      bid: typeof bid === "number" ? bid : null,
      ask: typeof ask === "number" ? ask : null,
      payload: (payload as Record<string, unknown> | undefined) ?? null,
      ...(parsedTimestamp ? { timestamp: parsedTimestamp } : {}),
    })
    // Same (symbol, feedType, timestamp) already stored -- re-fetch of a
    // still-open candle, a re-run backfill -- is a no-op, not a duplicate row.
    .onConflictDoNothing({
      target: [marketFeedsTable.symbol, marketFeedsTable.feedType, marketFeedsTable.timestamp],
    })
    .returning();

  res.status(saved ? 201 : 200).json(saved ?? { skipped: true, reason: "duplicate (symbol, feedType, timestamp)" });
});

export default router;
