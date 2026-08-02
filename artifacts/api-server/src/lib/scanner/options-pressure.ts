/**
 * Zero-DTE Options Pressure
 * Source: Polygon.io options snapshot (free tier — set POLYGON_API_KEY)
 * Computes put/call ratio to determine market lean (BEARISH/BULLISH/NEUTRAL)
 * P/C > 1.2 = BEARISH, P/C < 0.7 = BULLISH
 * Cache: 5 minutes
 */

interface OptionsFlow {
  symbol: string;
  expiration: string | null;
  putVolume: number | null;
  callVolume: number | null;
  putCallRatio: number | null;
  sentiment: "BEARISH" | "BULLISH" | "NEUTRAL" | "UNAVAILABLE";
  totalOpenInterest: number | null;
  note: string | null;
  updatedAt: string;
}

const CACHE_TTL = 5 * 60 * 1000;
const optionsCache = new Map<string, { data: OptionsFlow; ts: number }>();

function isCryptoSymbol(s: string) {
  return s.endsWith("USDT") || s.endsWith("USD");
}

function getSentiment(pcr: number | null): "BEARISH" | "BULLISH" | "NEUTRAL" | "UNAVAILABLE" {
  if (pcr === null) return "UNAVAILABLE";
  if (pcr > 1.2) return "BEARISH"; // heavy put activity → bearish pressure
  if (pcr < 0.7) return "BULLISH"; // heavy call activity → bullish pressure
  return "NEUTRAL";
}

function processSnapshot(symbol: string, results: any[], expiration: string | null, updatedAt: string): OptionsFlow {
  let putVolume = 0, callVolume = 0, totalOI = 0;
  for (const c of results) {
    const vol = (c.day?.volume as number | undefined) ?? 0;
    const oi = (c.open_interest as number | undefined) ?? 0;
    const type: string | undefined = c.details?.contract_type;
    if (type === "put") putVolume += vol;
    else if (type === "call") callVolume += vol;
    totalOI += oi;
  }
  const putCallRatio = callVolume > 0 ? putVolume / callVolume : null;
  return {
    symbol,
    expiration,
    putVolume,
    callVolume,
    putCallRatio,
    sentiment: results.length === 0 ? "UNAVAILABLE" : getSentiment(putCallRatio),
    totalOpenInterest: totalOI,
    note: results.length === 0 ? "No options contracts found for this expiration" : null,
    updatedAt,
  };
}

export async function fetchOptionsFlow(symbol: string): Promise<OptionsFlow> {
  const cached = optionsCache.get(symbol);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  const updatedAt = new Date().toISOString();

  if (isCryptoSymbol(symbol)) {
    const result: OptionsFlow = {
      symbol, expiration: null, putVolume: null, callVolume: null,
      putCallRatio: null, sentiment: "UNAVAILABLE", totalOpenInterest: null,
      note: "Options flow not applicable for crypto",
      updatedAt,
    };
    optionsCache.set(symbol, { data: result, ts: Date.now() });
    return result;
  }

  const apiKey = process.env["POLYGON_API_KEY"];
  if (!apiKey) {
    const result: OptionsFlow = {
      symbol, expiration: null, putVolume: null, callVolume: null,
      putCallRatio: null, sentiment: "UNAVAILABLE", totalOpenInterest: null,
      note: "Add POLYGON_API_KEY (free tier at polygon.io) to enable options flow",
      updatedAt,
    };
    optionsCache.set(symbol, { data: result, ts: Date.now() });
    return result;
  }

  // Try Zero-DTE first (today's expiration), fall back to nearest
  const today = new Date().toISOString().split("T")[0]!;

  try {
    const zeroDteUrl =
      `https://api.polygon.io/v3/snapshot/options/${symbol}` +
      `?expiration_date=${today}&limit=250&apiKey=${apiKey}`;

    const res = await fetch(zeroDteUrl, { signal: AbortSignal.timeout(12000) });

    if (res.ok) {
      const data = await res.json();
      const results: any[] = (data as any)?.results ?? [];
      const flow = processSnapshot(symbol, results, today, updatedAt);
      optionsCache.set(symbol, { data: flow, ts: Date.now() });
      return flow;
    }

    if (res.status === 403 || res.status === 401) {
      const result: OptionsFlow = {
        symbol, expiration: null, putVolume: null, callVolume: null,
        putCallRatio: null, sentiment: "UNAVAILABLE", totalOpenInterest: null,
        note: "Polygon API key invalid or insufficient permissions",
        updatedAt,
      };
      optionsCache.set(symbol, { data: result, ts: Date.now() });
      return result;
    }

    // No ZeroDTE contracts — try nearest available expiration
    const nearestUrl =
      `https://api.polygon.io/v3/snapshot/options/${symbol}?limit=250&apiKey=${apiKey}`;
    const nearRes = await fetch(nearestUrl, { signal: AbortSignal.timeout(12000) });
    if (!nearRes.ok) throw new Error(`Polygon ${nearRes.status}`);

    const nearData = await nearRes.json();
    const nearResults: any[] = (nearData as any)?.results ?? [];
    // Find nearest expiration
    const expirations = [...new Set(nearResults.map((r) => r.details?.expiration_date as string | undefined).filter(Boolean))].sort();
    const nearest = expirations[0] ?? null;
    const filtered = nearest ? nearResults.filter((r) => r.details?.expiration_date === nearest) : nearResults;
    const flow = processSnapshot(symbol, filtered, nearest, updatedAt);
    flow.note = nearest && nearest !== today ? `No ZeroDTE contracts — showing nearest expiration (${nearest})` : flow.note;
    optionsCache.set(symbol, { data: flow, ts: Date.now() });
    return flow;
  } catch (e: any) {
    const result: OptionsFlow = {
      symbol, expiration: null, putVolume: null, callVolume: null,
      putCallRatio: null, sentiment: "UNAVAILABLE", totalOpenInterest: null,
      note: `Error: ${e?.message ?? "Unknown"}`,
      updatedAt,
    };
    optionsCache.set(symbol, { data: result, ts: Date.now() });
    return result;
  }
}
