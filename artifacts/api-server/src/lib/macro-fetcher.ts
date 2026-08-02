import { logger } from "./logger";

export interface MacroResult {
  fedSignal: "DOVISH" | "HAWKISH" | "NEUTRAL";
  inflationSignal: "HIGH" | "LOW" | "NEUTRAL";
  gdp: string | null;
  cpi: string | null;
  vix: number | null;
  updatedAt: string;
}

export async function fetchMacroData(): Promise<MacroResult> {
  const result: MacroResult = {
    fedSignal: "NEUTRAL",
    inflationSignal: "NEUTRAL",
    gdp: null,
    cpi: null,
    vix: null,
    updatedAt: new Date().toISOString(),
  };

  const fredApiKey = process.env["FRED_API_KEY"];
  if (fredApiKey) {
    try {
      // GDP
      const gdpUrl = `https://api.stlouisfed.org/fred/series/observations?series_id=GDP&api_key=${fredApiKey}&file_type=json&limit=1&sort_order=desc`;
      const gdpRes = await fetch(gdpUrl, { signal: AbortSignal.timeout(5000) });
      if (gdpRes.ok) {
        const gdpData = await gdpRes.json() as { observations?: { value: string }[] };
        result.gdp = gdpData.observations?.[0]?.value ?? null;
      }
    } catch (err) {
      logger.warn({ err }, "FRED GDP fetch failed");
    }

    try {
      // CPI
      const cpiUrl = `https://api.stlouisfed.org/fred/series/observations?series_id=CPIAUCSL&api_key=${fredApiKey}&file_type=json&limit=1&sort_order=desc`;
      const cpiRes = await fetch(cpiUrl, { signal: AbortSignal.timeout(5000) });
      if (cpiRes.ok) {
        const cpiData = await cpiRes.json() as { observations?: { value: string }[] };
        const cpiVal = parseFloat(cpiData.observations?.[0]?.value ?? "0");
        result.cpi = cpiData.observations?.[0]?.value ?? null;
        // Simple CPI heuristic: > 3% = HIGH inflation
        if (cpiVal > 3) {
          result.inflationSignal = "HIGH";
          result.fedSignal = "HAWKISH";
        } else if (cpiVal < 2) {
          result.inflationSignal = "LOW";
          result.fedSignal = "DOVISH";
        }
      }
    } catch (err) {
      logger.warn({ err }, "FRED CPI fetch failed");
    }
  }

  // VIX from Alpha Vantage if key is set
  const avKey = process.env["ALPHAVANTAGE_API_KEY"];
  if (avKey) {
    try {
      const vixUrl = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=VIX&apikey=${avKey}&outputsize=compact`;
      const vixRes = await fetch(vixUrl, { signal: AbortSignal.timeout(5000) });
      if (vixRes.ok) {
        const vixData = await vixRes.json() as { "Time Series (Daily)"?: Record<string, { "4. close": string }> };
        const series = vixData["Time Series (Daily)"];
        if (series) {
          const latestDate = Object.keys(series).sort().reverse()[0];
          result.vix = parseFloat(series[latestDate]?.["4. close"] ?? "0");
        }
      }
    } catch (err) {
      logger.warn({ err }, "VIX fetch failed");
    }
  }

  return result;
}
