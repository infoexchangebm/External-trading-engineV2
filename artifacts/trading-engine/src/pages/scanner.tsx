import { useCallback, useState } from "react";
import { useGetScannerNews, useGetScannerRvol, useGetScannerMomentum, useGetScannerOptionsFlow, useGetConfig } from "@workspace/api-client-react";
import { RefreshCw, Newspaper, BarChart2, TrendingUp, Activity, ExternalLink, AlertTriangle, CheckCircle2, XCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Helpers ────────────────────────────────────────────────────────────────────

function ts(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " +
    d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function fmtVol(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "K";
  return n.toFixed(0);
}

function fmtFloat(m: number | null | undefined) {
  if (m === null || m === undefined) return "—";
  return m.toFixed(1) + "M";
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionTitle({ icon: Icon, label, subtitle }: { icon: React.ElementType; label: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon className="w-4 h-4 text-primary" />
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-widest">{label}</h2>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

function PassBadge({ pass, label }: { pass: boolean; label: string }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1 text-xs px-1.5 py-0.5 font-mono uppercase",
      pass ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
    )}>
      {pass ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
      {label}
    </span>
  );
}

function RvolBadge({ signal }: { signal: string }) {
  const map: Record<string, string> = {
    HIGH: "bg-success/10 text-success",
    NORMAL: "bg-primary/10 text-primary",
    LOW: "bg-muted text-muted-foreground",
    UNAVAILABLE: "bg-muted text-muted-foreground",
  };
  return (
    <span className={cn("text-xs px-2 py-0.5 font-mono uppercase", map[signal] ?? map["UNAVAILABLE"])}>
      {signal}
    </span>
  );
}

function SentimentBadge({ sentiment }: { sentiment: string }) {
  const map: Record<string, string> = {
    BEARISH: "bg-destructive/10 text-destructive",
    BULLISH: "bg-success/10 text-success",
    NEUTRAL: "bg-primary/10 text-primary",
    UNAVAILABLE: "bg-muted text-muted-foreground",
  };
  return (
    <span className={cn("text-xs px-2 py-0.5 font-mono uppercase", map[sentiment] ?? map["UNAVAILABLE"])}>
      {sentiment}
    </span>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 py-6 text-muted-foreground text-sm">
      <AlertTriangle className="w-4 h-4 shrink-0" />
      {message}
    </div>
  );
}

function LoadingRows({ n = 3 }: { n?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="h-10 bg-muted/50 animate-pulse" />
      ))}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function Scanner() {
  const [lastScan, setLastScan] = useState<Date | null>(null);

  const { data: config } = useGetConfig();
  const symbolsParam = config?.symbols?.join(",") ?? "";

  // First non-crypto stock for options flow
  const stockSymbol = config?.symbols?.find(s => !s.endsWith("USDT") && !s.endsWith("USD")) ?? "AAPL";

  const refetchInterval = 5 * 60 * 1000; // 5 min auto-refresh

  const newsQ = useGetScannerNews({ symbols: symbolsParam }, { query: { refetchInterval, enabled: !!symbolsParam } });
  const rvolQ = useGetScannerRvol({ symbols: symbolsParam }, { query: { refetchInterval, enabled: !!symbolsParam } });
  const momQ = useGetScannerMomentum({ symbols: symbolsParam }, { query: { refetchInterval, enabled: !!symbolsParam } });
  const optQ = useGetScannerOptionsFlow({ symbol: stockSymbol }, { query: { refetchInterval, enabled: !!stockSymbol } });

  const scanning = newsQ.isFetching || rvolQ.isFetching || momQ.isFetching || optQ.isFetching;

  const scanNow = useCallback(async () => {
    await Promise.all([newsQ.refetch(), rvolQ.refetch(), momQ.refetch(), optQ.refetch()]);
    setLastScan(new Date());
  }, [newsQ, rvolQ, momQ, optQ]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground mono-data uppercase tracking-widest mt-1">
            News · RVOL · Momentum · Options Pressure
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastScan && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground mono-data">
              <Clock className="w-3 h-3" />
              Last: {lastScan.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={scanNow}
            disabled={scanning}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            <RefreshCw className={cn("w-4 h-4", scanning && "animate-spin")} />
            {scanning ? "Scanning…" : "Scan Now"}
          </button>
        </div>
      </div>

      {/* ── Row 1: News + RVOL ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* News Feed */}
        <div className="lg:col-span-2 border border-border bg-card p-5">
          <SectionTitle
            icon={Newspaper}
            label="News & Catalysts"
            subtitle="Finnhub · SEC EDGAR 8-K · FDA — 7-day window"
          />
          {newsQ.isLoading ? (
            <LoadingRows n={4} />
          ) : !newsQ.data || newsQ.data.length === 0 ? (
            <EmptyState message="No news found. Configure FINNHUB_API_KEY for live news." />
          ) : (
            <div className="space-y-1 max-h-96 overflow-y-auto pr-1">
              {newsQ.data.map((item) => (
                <div key={item.id} className="flex gap-3 py-2.5 border-b border-border last:border-0">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {item.isBreaking && (
                        <span className="text-xs bg-destructive/10 text-destructive px-1.5 py-0.5 font-mono uppercase">
                          CATALYST
                        </span>
                      )}
                      {item.symbol && (
                        <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 font-mono">
                          {item.symbol}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground mono-data">{item.source}</span>
                    </div>
                    <p className="text-sm font-medium leading-snug truncate">{item.headline}</p>
                    {item.summary && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{item.summary}</p>
                    )}
                    <p className="text-xs text-muted-foreground mono-data mt-1">{ts(item.datetime)}</p>
                  </div>
                  {item.url && (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 mt-1 text-muted-foreground hover:text-primary transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* RVOL */}
        <div className="border border-border bg-card p-5">
          <SectionTitle
            icon={BarChart2}
            label="Relative Volume"
            subtitle="RVOL ≥ 5× flags unusual activity"
          />
          {rvolQ.isLoading ? (
            <LoadingRows n={3} />
          ) : !rvolQ.data || rvolQ.data.length === 0 ? (
            <EmptyState message="No RVOL data. Configure ALPHAVANTAGE_API_KEY." />
          ) : (
            <div className="space-y-3">
              {rvolQ.data.map((entry) => (
                <div key={entry.symbol} className="border border-border p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-sm font-semibold">{entry.symbol}</span>
                    <RvolBadge signal={entry.signal} />
                  </div>
                  {entry.rvol !== null ? (
                    <>
                      <div className="flex items-end gap-1 mb-2">
                        <span className="text-2xl font-mono font-bold">{entry.rvol.toFixed(2)}<span className="text-sm font-normal text-muted-foreground">×</span></span>
                        {entry.meetsFilter && (
                          <span className="text-xs text-success mono-data pb-0.5">▲ 5× FILTER</span>
                        )}
                      </div>
                      {/* Mini bar */}
                      <div className="h-1.5 bg-muted overflow-hidden">
                        <div
                          className={cn("h-full transition-all", entry.meetsFilter ? "bg-success" : "bg-primary")}
                          style={{ width: `${Math.min(100, (entry.rvol / 10) * 100)}%` }}
                        />
                      </div>
                      <div className="flex justify-between mt-1 text-xs text-muted-foreground mono-data">
                        <span>Today: {fmtVol(entry.currentVolume)}</span>
                        <span>50d avg: {fmtVol(entry.avgVolume50d)}</span>
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">{entry.note ?? "No data"}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Row 2: Momentum + Options ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Momentum Screener */}
        <div className="border border-border bg-card p-5">
          <SectionTitle
            icon={TrendingUp}
            label="Momentum Screener"
            subtitle="Price $2–$20 · Change 2–10% · Float < 10M shares"
          />
          {momQ.isLoading ? (
            <LoadingRows n={3} />
          ) : !momQ.data || momQ.data.length === 0 ? (
            <EmptyState message="No momentum data available." />
          ) : (
            <div className="space-y-3">
              {momQ.data.map((entry) => (
                <div key={entry.symbol} className={cn(
                  "border p-3",
                  entry.meetsAll ? "border-success/50 bg-success/5" : "border-border"
                )}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-sm font-semibold">{entry.symbol}</span>
                    <span className={cn("text-xs font-mono", entry.meetsAll ? "text-success" : "text-muted-foreground")}>
                      {entry.meetsAll ? "✓ PASS" : "✗ FAIL"}
                    </span>
                  </div>
                  {entry.price !== null ? (
                    <>
                      <div className="flex items-baseline gap-3 mb-2">
                        <span className="text-xl font-mono font-bold">${entry.price.toFixed(2)}</span>
                        {entry.changePercent !== null && (
                          <span className={cn("text-sm font-mono", entry.changePercent >= 0 ? "text-success" : "text-destructive")}>
                            {entry.changePercent >= 0 ? "+" : ""}{entry.changePercent.toFixed(2)}%
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        <PassBadge pass={entry.meetsPrice} label="$2–$20" />
                        <PassBadge pass={entry.meetsMomentum} label="2–10%" />
                        {entry.floatMillions !== null && (
                          <PassBadge pass={entry.meetsFloat} label={`Float ${fmtFloat(entry.floatMillions)}`} />
                        )}
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground mono-data">
                        Vol: {fmtVol(entry.volume)}
                        {entry.floatMillions !== null && ` · Float: ${fmtFloat(entry.floatMillions)}`}
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">{entry.note ?? "No data"}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Options Pressure */}
        <div className="border border-border bg-card p-5">
          <SectionTitle
            icon={Activity}
            label="Options Pressure"
            subtitle="Zero-DTE put/call ratio via Polygon.io"
          />
          {optQ.isLoading ? (
            <LoadingRows n={2} />
          ) : !optQ.data ? (
            <EmptyState message="No options data." />
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm font-semibold">{optQ.data.symbol}</span>
                <SentimentBadge sentiment={optQ.data.sentiment} />
              </div>

              {optQ.data.putCallRatio !== null ? (
                <>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 mono-data uppercase">Put / Call Ratio</p>
                    <div className="flex items-end gap-2">
                      <span className="text-3xl font-mono font-bold">{optQ.data.putCallRatio.toFixed(2)}</span>
                      <span className="text-xs text-muted-foreground pb-1">
                        {optQ.data.putCallRatio > 1.2 ? "Heavy put activity" : optQ.data.putCallRatio < 0.7 ? "Heavy call activity" : "Balanced"}
                      </span>
                    </div>
                  </div>

                  {/* Put/Call bar */}
                  <div>
                    <div className="flex justify-between text-xs mono-data text-muted-foreground mb-1">
                      <span>Puts: {fmtVol(optQ.data.putVolume)}</span>
                      <span>Calls: {fmtVol(optQ.data.callVolume)}</span>
                    </div>
                    {(() => {
                      const total = (optQ.data.putVolume ?? 0) + (optQ.data.callVolume ?? 0);
                      const putPct = total > 0 ? ((optQ.data.putVolume ?? 0) / total) * 100 : 50;
                      return (
                        <div className="h-3 bg-muted flex overflow-hidden">
                          <div className="bg-destructive/70 h-full transition-all" style={{ width: `${putPct}%` }} />
                          <div className="bg-success/70 h-full flex-1" />
                        </div>
                      );
                    })()}
                    <div className="flex justify-between text-xs text-muted-foreground mt-0.5">
                      <span className="text-destructive/70">PUTS</span>
                      <span className="text-success/70">CALLS</span>
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground mono-data space-y-1 pt-1 border-t border-border">
                    <div className="flex justify-between">
                      <span>Total Open Interest</span>
                      <span>{fmtVol(optQ.data.totalOpenInterest)}</span>
                    </div>
                    {optQ.data.expiration && (
                      <div className="flex justify-between">
                        <span>Expiration</span>
                        <span>{optQ.data.expiration}</span>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="space-y-3">
                  <EmptyState message={optQ.data.note ?? "Options data unavailable."} />
                  {optQ.data.note?.includes("POLYGON_API_KEY") && (
                    <div className="border border-border p-3 text-xs text-muted-foreground space-y-1">
                      <p className="font-medium text-foreground">Enable options flow:</p>
                      <ol className="list-decimal list-inside space-y-1">
                        <li>Sign up free at <span className="text-primary">polygon.io</span></li>
                        <li>Copy your API key</li>
                        <li>Add <code className="bg-muted px-1">POLYGON_API_KEY</code> to your environment secrets</li>
                        <li>Restart the API server</li>
                      </ol>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* API key status */}
      <div className="border border-border bg-card p-4">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-2">Data Source Status</p>
        <div className="flex flex-wrap gap-3 text-xs mono-data">
          {[
            { label: "Finnhub (news)", key: "FINNHUB_API_KEY" },
            { label: "Alpha Vantage (RVOL/momentum)", key: "ALPHAVANTAGE_API_KEY" },
            { label: "SEC EDGAR (float/filings)", key: null },
            { label: "FDA API (adverse events)", key: null },
            { label: "Polygon.io (options)", key: "POLYGON_API_KEY" },
          ].map(({ label, key }) => (
            <div key={label} className="flex items-center gap-1.5">
              <span className={cn("w-2 h-2 rounded-full", key === null ? "bg-success" : "bg-muted-foreground")} />
              <span>{label}</span>
              {key && <span className="text-muted-foreground/60">({key})</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
