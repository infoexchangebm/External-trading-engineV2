/**
 * Momentum Screener
 * Criteria: price $2–$20, up 2–10% pre-market, low float < 10M shares
 * Sources:
 *   - Price/change: Alpha Vantage GLOBAL_QUOTE (free 25 req/day)
 *   - Float approximation: SEC EDGAR shares outstanding (free, no key)
 * Cache: 5 minutes
 */

interface MomentumEntry {
  symbol: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  volume: number | null;
  floatShares: number | null;
  floatMillions: number | null;
  meetsPrice: boolean;
  meetsMomentum: boolean;
  meetsFloat: boolean;
  meetsAll: boolean;
  note: string | null;
}

const CACHE_TTL = 5 * 60 * 1000;
const quoteCache = new Map<string, { data: MomentumEntry; ts: number }>();

// SEC EDGAR ticker → CIK map (loaded once)
let cikMapCache: Record<string, string> | null = null;
let cikMapLoadedAt = 0;
const CIK_CACHE_TTL = 24 * 60 * 60 * 1000; // 1 day

async function getCikMap(): Promise<Record<string, string>> {
  if (cikMapCache && Date.now() - cikMapLoadedAt < CIK_CACHE_TTL) return cikMapCache;
  try {
    const res = await fetch("https://www.sec.gov/files/company_tickers.json", {
      headers: { "User-Agent": "TradingEngine/1.0 contact@example.com" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return cikMapCache ?? {};
    const data = (await res.json()) as Record<string, any>;
    const map: Record<string, string> = {};
    for (const item of Object.values(data) as any[]) {
      map[(item.ticker as string).toUpperCase()] = String(item.cik_str).padStart(10, "0");
    }
    cikMapCache = map;
    cikMapLoadedAt = Date.now();
    return map;
  } catch {
    return cikMapCache ?? {};
  }
}

async function getFloatSharesFromEdgar(symbol: string): Promise<number | null> {
  try {
    const cikMap = await getCikMap();
    const cik = cikMap[symbol.toUpperCase()];
    if (!cik) return null;

    const res = await fetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, {
      headers: { "User-Agent": "TradingEngine/1.0 contact@example.com" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, any>;

    const units: any[] | undefined =
      data?.facts?.["us-gaap"]?.["CommonStockSharesOutstanding"]?.units?.shares;
    if (!units || units.length === 0) return null;

    // Most recent 10-K/10-Q filing
    const sorted = [...units]
      .filter((u) => u.form === "10-K" || u.form === "10-Q")
      .sort((a, b) => new Date(b.end).getTime() - new Date(a.end).getTime());

    return (sorted[0]?.val as number | undefined) ?? null;
  } catch {
    return null;
  }
}

function isCryptoSymbol(s: string) {
  return s.endsWith("USDT") || s.endsWith("USD");
}

export async function fetchMomentum(symbols: string[]): Promise<MomentumEntry[]> {
  const apiKey = process.env["ALPHAVANTAGE_API_KEY"];
  const results: MomentumEntry[] = [];

  for (const symbol of symbols) {
    const cached = quoteCache.get(symbol);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      results.push(cached.data);
      continue;
    }

    const crypto = isCryptoSymbol(symbol);

    // Crypto: price range $2–$20 and float don't apply — show price only
    if (crypto) {
      if (!apiKey) {
        const entry: MomentumEntry = {
          symbol, price: null, change: null, changePercent: null, volume: null,
          floatShares: null, floatMillions: null,
          meetsPrice: false, meetsMomentum: false, meetsFloat: false, meetsAll: false,
          note: "Set ALPHAVANTAGE_API_KEY for data",
        };
        results.push(entry);
        continue;
      }

      try {
        const base = symbol.replace(/USDT$/, "").replace(/USD$/, "");
        const url = `https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=${base}&to_currency=USD&apikey=${apiKey}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
        const data = await res.json();
        const rate = (data as any)?.["Realtime Currency Exchange Rate"];
        const price = rate ? parseFloat(rate["5. Exchange Rate"]) : null;
        const entry: MomentumEntry = {
          symbol, price, change: null, changePercent: null, volume: null,
          floatShares: null, floatMillions: null,
          meetsPrice: false, meetsMomentum: false, meetsFloat: false, meetsAll: false,
          note: "Price range / float filter not applicable for crypto",
        };
        quoteCache.set(symbol, { data: entry, ts: Date.now() });
        results.push(entry);
      } catch {
        results.push({
          symbol, price: null, change: null, changePercent: null, volume: null,
          floatShares: null, floatMillions: null,
          meetsPrice: false, meetsMomentum: false, meetsFloat: false, meetsAll: false,
          note: "Fetch error",
        });
      }
      continue;
    }

    if (!apiKey) {
      results.push({
        symbol, price: null, change: null, changePercent: null, volume: null,
        floatShares: null, floatMillions: null,
        meetsPrice: false, meetsMomentum: false, meetsFloat: false, meetsAll: false,
        note: "Set ALPHAVANTAGE_API_KEY for momentum data",
      });
      continue;
    }

    try {
      const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${apiKey}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      const data = await res.json();

      if ((data as any)["Note"] || (data as any)["Information"]) {
        results.push({
          symbol, price: null, change: null, changePercent: null, volume: null,
          floatShares: null, floatMillions: null,
          meetsPrice: false, meetsMomentum: false, meetsFloat: false, meetsAll: false,
          note: "API rate limited (25 req/day on free tier)",
        });
        continue;
      }

      const q = (data as any)["Global Quote"];
      if (!q || !q["05. price"]) {
        results.push({
          symbol, price: null, change: null, changePercent: null, volume: null,
          floatShares: null, floatMillions: null,
          meetsPrice: false, meetsMomentum: false, meetsFloat: false, meetsAll: false,
          note: "No quote data returned",
        });
        continue;
      }

      const price = parseFloat(q["05. price"]);
      const change = parseFloat(q["09. change"]);
      const changePercent = parseFloat((q["10. change percent"] as string).replace("%", "").trim());
      const volume = parseFloat(q["06. volume"]);

      // Float from SEC EDGAR (shares outstanding as approximation)
      const floatShares = await getFloatSharesFromEdgar(symbol);
      const floatMillions = floatShares !== null ? floatShares / 1_000_000 : null;

      const meetsPrice = price >= 2 && price <= 20;
      const meetsMomentum = changePercent >= 2 && changePercent <= 10;
      const meetsFloat = floatMillions !== null ? floatMillions < 10 : false;
      const meetsAll = meetsPrice && meetsMomentum;

      const fails: string[] = [];
      if (!meetsPrice) fails.push(`price $${price.toFixed(2)} out of $2–$20`);
      if (!meetsMomentum) fails.push(`${changePercent.toFixed(2)}% not in 2–10% range`);

      const entry: MomentumEntry = {
        symbol, price, change, changePercent, volume,
        floatShares, floatMillions,
        meetsPrice, meetsMomentum, meetsFloat, meetsAll,
        note: fails.length ? `Fails: ${fails.join("; ")}` : null,
      };
      quoteCache.set(symbol, { data: entry, ts: Date.now() });
      results.push(entry);
    } catch (e: any) {
      results.push({
        symbol, price: null, change: null, changePercent: null, volume: null,
        floatShares: null, floatMillions: null,
        meetsPrice: false, meetsMomentum: false, meetsFloat: false, meetsAll: false,
        note: `Error: ${e?.message ?? "Unknown"}`,
      });
    }
  }

  return results;
}
