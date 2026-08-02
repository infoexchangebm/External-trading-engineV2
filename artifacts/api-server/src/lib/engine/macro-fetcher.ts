import { logger } from "../logger.js";
import { MacroMetrics } from "./types.js";

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minute cache for macro data
let macroCache: { data: MacroMetrics; fetchedAt: number } | null = null;

export async function fetchMacroData(): Promise<MacroMetrics> {
  if (macroCache && Date.now() - macroCache.fetchedAt < CACHE_TTL_MS) {
    return macroCache.data;
  }

  let fedSignal: "DOVISH" | "HAWKISH" | "NEUTRAL" = "NEUTRAL";
  let inflationSignal: "HIGH" | "LOW" | "NEUTRAL" = "NEUTRAL";
  let gdp: string | null = null;
  let cpi: string | null = null;
  let vix: number | null = null;
  let sourcesCount = 0;
  let successfulSources = 0;

  // Source 1: FRED API for GDP & CPI
  const fredApiKey = process.env["FRED_API_KEY"];
  if (fredApiKey) {
    sourcesCount += 2;
    try {
      const gdpUrl = `https://api.stlouisfed.org/fred/series/observations?series_id=GDP&api_key=${fredApiKey}&file_type=json&limit=1&sort_order=desc`;
      const res = await fetch(gdpUrl, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = (await res.json()) as { observations?: { value: string }[] };
        gdp = data.observations?.[0]?.value ?? null;
        if (gdp) successfulSources++;
      }
    } catch (err) {
      logger.warn({ err }, "FRED GDP fetch failed");
    }

    try {
      const cpiUrl = `https://api.stlouisfed.org/fred/series/observations?series_id=CPIAUCSL&api_key=${fredApiKey}&file_type=json&limit=1&sort_order=desc`;
      const res = await fetch(cpiUrl, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = (await res.json()) as { observations?: { value: string }[] };
        cpi = data.observations?.[0]?.value ?? null;
        if (cpi) {
          successfulSources++;
          const cpiVal = parseFloat(cpi);
          if (cpiVal > 3.0) {
            inflationSignal = "HIGH";
            fedSignal = "HAWKISH";
          } else if (cpiVal < 2.0) {
            inflationSignal = "LOW";
            fedSignal = "DOVISH";
          }
        }
      }
    } catch (err) {
      logger.warn({ err }, "FRED CPI fetch failed");
    }
  }

  // Source 2: VIX index via Alpha Vantage
  const avKey = process.env["ALPHAVANTAGE_API_KEY"];
  if (avKey) {
    sourcesCount++;
    try {
      const vixUrl = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=VIX&apikey=${avKey}&outputsize=compact`;
      const res = await fetch(vixUrl, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = (await res.json()) as { "Time Series (Daily)"?: Record<string, { "4. close": string }> };
        const series = data["Time Series (Daily)"];
        if (series) {
          const latestDate = Object.keys(series).sort().reverse()[0];
          vix = parseFloat(series[latestDate]?.["4. close"] ?? "0");
          if (vix > 0) successfulSources++;
        }
      }
    } catch (err) {
      logger.warn({ err }, "Alpha Vantage VIX fetch failed");
    }
  }

  // Calculate Risk-On score (-1.0 to +1.0) safely without tanking score on missing data
  let riskOnScore = 0;

  // Fed stance impact
  if (fedSignal === "DOVISH") riskOnScore += 0.5;
  else if (fedSignal === "HAWKISH") riskOnScore -= 0.5;

  // VIX impact (VIX < 20 is Risk-On, VIX > 30 is Risk-Off / Fear)
  if (vix !== null && vix > 0) {
    if (vix < 18) riskOnScore += 0.5;
    else if (vix > 28) riskOnScore -= 0.5;
  }

  riskOnScore = parseFloat(Math.max(-1.0, Math.min(+1.0, riskOnScore)).toFixed(2));

  const signal: "BULLISH" | "BEARISH" | "NEUTRAL" =
    riskOnScore > 0.25 ? "BULLISH" : riskOnScore < -0.25 ? "BEARISH" : "NEUTRAL";

  // Data confidence: 1.0 if sources available, 0.5 fallback baseline if no API keys supplied
  const dataConfidence = sourcesCount > 0 ? parseFloat((successfulSources / sourcesCount).toFixed(2)) : 0.5;

  const result: MacroMetrics = {
    fedSignal,
    inflationSignal,
    gdp,
    cpi,
    vix,
    riskOnScore,
    signal,
    dataConfidence,
    updatedAt: new Date().toISOString(),
  };

  macroCache = { data: result, fetchedAt: Date.now() };
  return result;
}
