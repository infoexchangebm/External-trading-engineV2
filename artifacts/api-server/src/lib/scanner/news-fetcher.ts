/**
 * News & Catalyst Fetcher
 * Sources: Finnhub company/crypto news (free tier) + SEC EDGAR 8-K full-text search (no key)
 * Cache: 5 minutes
 */

interface NewsItem {
  id: string;
  symbol: string | null;
  headline: string;
  summary: string | null;
  url: string | null;
  source: string;
  datetime: string;
  category: string | null;
  isBreaking: boolean;
}

const CACHE_TTL = 5 * 60 * 1000;
const newsCache = new Map<string, { data: NewsItem[]; ts: number }>();

const BREAKING_KEYWORDS = [
  "earnings", "fda", "approval", "clinical trial", "phase 3", "phase 2",
  "merger", "acquisition", "beat", "miss", "guidance", "quarterly results",
  "revenue", "profit", "loss", "dividend", "recall", "lawsuit", "settlement",
  "upgrade", "downgrade", "halt", "bankruptcy", "ipo",
];

function isBreakingCatalyst(text: string): boolean {
  const lower = text.toLowerCase();
  return BREAKING_KEYWORDS.some((kw) => lower.includes(kw));
}

function isCryptoSymbol(symbol: string): boolean {
  return symbol.endsWith("USDT") || symbol.endsWith("USD") || symbol.endsWith("BTC") || symbol.endsWith("ETH");
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0]!;
}

export async function fetchNews(symbols: string[]): Promise<NewsItem[]> {
  const key = [...symbols].sort().join(",");
  const cached = newsCache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  const results: NewsItem[] = [];
  const apiKey = process.env["FINNHUB_API_KEY"];

  const now = new Date();
  const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fromStr = formatDate(from);
  const toStr = formatDate(now);

  for (const symbol of symbols) {
    const crypto = isCryptoSymbol(symbol);

    // ── Finnhub ──────────────────────────────────────────────────────────
    if (apiKey) {
      try {
        let url: string;
        if (crypto) {
          url = `https://finnhub.io/api/v1/news?category=crypto&token=${apiKey}`;
        } else {
          url = `https://finnhub.io/api/v1/company-news?symbol=${symbol}&from=${fromStr}&to=${toStr}&token=${apiKey}`;
        }

        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (res.ok) {
          const data = (await res.json()) as any[];
          const items = crypto
            ? data.filter((item) => {
                const base = symbol.replace(/USDT$/, "").replace(/USD$/, "");
                return (item.headline + (item.summary ?? "")).toUpperCase().includes(base);
              })
            : data;

          for (const item of items.slice(0, 5)) {
            results.push({
              id: `fh-${item.id}`,
              symbol,
              headline: item.headline,
              summary: item.summary ?? null,
              url: item.url ?? null,
              source: item.source ?? "Finnhub",
              datetime: new Date((item.datetime as number) * 1000).toISOString(),
              category: item.category ?? null,
              isBreaking: isBreakingCatalyst((item.headline ?? "") + " " + (item.summary ?? "")),
            });
          }
        }
      } catch {
        // non-fatal
      }
    }

    // ── SEC EDGAR 8-K full-text search (no API key required) ─────────────
    if (!crypto) {
      try {
        const egUrl =
          `https://efts.sec.gov/LATEST/search-index?q=%22${encodeURIComponent(symbol)}%22` +
          `&forms=8-K&dateRange=custom&startdt=${fromStr}&enddt=${toStr}`;

        const res = await fetch(egUrl, {
          headers: { "User-Agent": "TradingEngine/1.0 contact@example.com" },
          signal: AbortSignal.timeout(8000),
        });

        if (res.ok) {
          const data = (await res.json()) as Record<string, any>;
          const hits: any[] = data?.hits?.hits ?? [];
          for (const hit of hits.slice(0, 3)) {
            const src = hit._source ?? {};
            const fileDate: string = src.file_date ?? toStr;
            results.push({
              id: `edgar-${hit._id}`,
              symbol,
              headline: `SEC 8-K: ${(src.display_names as string[] | undefined)?.join(", ") ?? symbol}`,
              summary: `Filed ${fileDate}. Period: ${src.period_of_report ?? "N/A"}. Form: ${src.form_type ?? "8-K"}`,
              url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${encodeURIComponent(symbol)}&type=8-K&dateb=&owner=include&count=5`,
              source: "SEC EDGAR",
              datetime: new Date(fileDate).toISOString(),
              category: "filing",
              isBreaking: false,
            });
          }
        }
      } catch {
        // non-fatal
      }
    }

    // ── FDA drug events (no key, free) ───────────────────────────────────
    if (!crypto) {
      try {
        const fdaUrl = `https://api.fda.gov/drug/event.json?search=patient.drug.openfda.brand_name:"${symbol}"&limit=2&sort=receivedate:desc`;
        const res = await fetch(fdaUrl, { signal: AbortSignal.timeout(6000) });
        if (res.ok) {
          const data = (await res.json()) as Record<string, any>;
          const events: any[] = data?.results ?? [];
          for (const ev of events) {
            results.push({
              id: `fda-${ev.safetyreportid}`,
              symbol,
              headline: `FDA Adverse Event: ${ev.patient?.drug?.[0]?.openfda?.brand_name?.[0] ?? symbol}`,
              summary: `Seriousness: ${ev.serious === "1" ? "SERIOUS" : "Non-serious"}. Received: ${ev.receivedate}`,
              url: `https://www.fda.gov/safety/medwatch`,
              source: "FDA",
              datetime: ev.receivedate
                ? new Date(
                    `${(ev.receivedate as string).slice(0, 4)}-${(ev.receivedate as string).slice(4, 6)}-${(ev.receivedate as string).slice(6, 8)}`
                  ).toISOString()
                : new Date().toISOString(),
              category: "FDA",
              isBreaking: true,
            });
          }
        }
      } catch {
        // non-fatal
      }
    }
  }

  // Sort newest first
  results.sort((a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime());
  newsCache.set(key, { data: results, ts: Date.now() });
  return results;
}
