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

  // Source 1: FRED API for GDP, CPI & VIX
  const fredApiKey = process.env["FRED_API_KEY"];
  if (fredApiKey) {
    sourcesCount += 3;
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

    // VIXCLS is the CBOE Volatility Index itself, so the thresholds below compare
    // against real index levels. Alpha Vantage cannot serve it — VIX is an index,
    // not a listed equity, and TIME_SERIES_DAILY?symbol=VIX returns "Invalid API call".
    try {
      const vixUrl = `https://api.stlouisfed.org/fred/series/observations?series_id=VIXCLS&api_key=${fredApiKey}&file_type=json&limit=10&sort_order=desc`;
      const res = await fetch(vixUrl, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = (await res.json()) as { observations?: { value: string }[] };
        // FRED reports market holidays as "." — take the most recent numeric close
        const latest = data.observations?.find((o) => parseFloat(o.value) > 0);
        if (latest) {
          vix = parseFloat(latest.value);
          successfulSources++;
        }
      }
    } catch (err) {
      logger.warn({ err }, "FRED VIX fetch failed");
    }
  }

  // Calculate Risk-On score (-1.0 to +1.0) safely without tanking score on missing data
  let riskOnScore = 0;

  // Fed stance impact
  if (fedSignal === "DOVISH") riskOnScore += 0.5;
  else if (fedSignal === "HAWKISH") riskOnScore -= 0.5;

  // VIX impact (VIX < 18 is Risk-On, VIX > 28 is Risk-Off / Fear)
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
