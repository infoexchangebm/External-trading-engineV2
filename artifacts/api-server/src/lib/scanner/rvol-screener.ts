/**
 * Relative Volume (RVOL) Screener
 * Source: Alpha Vantage daily series (free 25 req/day)
 * Flags symbols with RVOL >= 5x their 50-day average volume
 * Cache: 5 minutes
 */

interface RvolEntry {
  symbol: string;
  currentVolume: number | null;
  avgVolume50d: number | null;
  rvol: number | null;
  signal: "HIGH" | "NORMAL" | "LOW" | "UNAVAILABLE";
  meetsFilter: boolean;
  note: string | null;
}

const CACHE_TTL = 5 * 60 * 1000;
const rvolCache = new Map<string, { data: RvolEntry[]; ts: number }>();

function isCryptoSymbol(s: string) {
  return s.endsWith("USDT") || s.endsWith("USD");
}

function rvolSignal(rvol: number | null): "HIGH" | "NORMAL" | "LOW" | "UNAVAILABLE" {
  if (rvol === null) return "UNAVAILABLE";
  if (rvol >= 5) return "HIGH";
  if (rvol >= 1.5) return "NORMAL";
  return "LOW";
}

export async function fetchRvol(symbols: string[]): Promise<RvolEntry[]> {
  const key = [...symbols].sort().join(",");
  const cached = rvolCache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  const apiKey = process.env["ALPHAVANTAGE_API_KEY"];
  const results: RvolEntry[] = [];

  for (const symbol of symbols) {
    if (!apiKey) {
      results.push({
        symbol, currentVolume: null, avgVolume50d: null, rvol: null,
        signal: "UNAVAILABLE", meetsFilter: false,
        note: "Set ALPHAVANTAGE_API_KEY for RVOL data",
      });
      continue;
    }

    const crypto = isCryptoSymbol(symbol);

    try {
      let url: string;
      if (crypto) {
        const base = symbol.replace(/USDT$/, "").replace(/USD$/, "");
        url = `https://www.alphavantage.co/query?function=DIGITAL_CURRENCY_DAILY&symbol=${base}&market=USD&apikey=${apiKey}`;
      } else {
        url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${symbol}&outputsize=compact&apikey=${apiKey}`;
      }

      const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
      const data = await res.json();

      // Rate limit check
      if ((data as any)["Note"] || (data as any)["Information"]) {
        results.push({
          symbol, currentVolume: null, avgVolume50d: null, rvol: null,
          signal: "UNAVAILABLE", meetsFilter: false,
          note: "API rate limited (25 req/day on free tier) — cached for 5 min",
        });
        continue;
      }

      let volumes: number[] = [];

      if (crypto) {
        const series = (data as any)["Time Series (Digital Currency Daily)"] ?? {};
        const days = Object.keys(series).sort().reverse();
        volumes = days.slice(0, 51).map((d) => parseFloat(series[d]["5. volume"] ?? "0"));
      } else {
        const series = (data as any)["Time Series (Daily)"] ?? {};
        const days = Object.keys(series).sort().reverse();
        volumes = days.slice(0, 51).map((d) => parseFloat(series[d]["6. volume"] ?? "0"));
      }

      if (volumes.length < 2) {
        results.push({
          symbol, currentVolume: null, avgVolume50d: null, rvol: null,
          signal: "UNAVAILABLE", meetsFilter: false, note: "Insufficient data",
        });
        continue;
      }

      const today = volumes[0]!;
      const past = volumes.slice(1);
      const avg50 = past.reduce((a, b) => a + b, 0) / past.length;
      const rvol = avg50 > 0 ? today / avg50 : null;

      results.push({
        symbol,
        currentVolume: today,
        avgVolume50d: avg50,
        rvol,
        signal: rvolSignal(rvol),
        meetsFilter: (rvol ?? 0) >= 5,
        note: null,
      });
    } catch (e: any) {
      results.push({
        symbol, currentVolume: null, avgVolume50d: null, rvol: null,
        signal: "UNAVAILABLE", meetsFilter: false,
        note: `Error: ${e?.message ?? "Unknown"}`,
      });
    }
  }

  rvolCache.set(key, { data: results, ts: Date.now() });
  return results;
}
